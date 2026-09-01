import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { toArrayBuffer } from './utils.js';

export type IntakeExtracted=
  |{kind:'rows';rows:Record<string,unknown>[]}
  |{kind:'texts';texts:string[]}
  |{kind:'archive';entries:{name:string;extracted:IntakeExtracted}[];skipped:string[]}
  |{kind:'client_pdf'}
  |{kind:'ocr_required'}
  |{kind:'unsupported'};

const decoder=new TextDecoder();
const MAX_ARCHIVE_ENTRIES=2500,MAX_SELECTED_ENTRY_BYTES=8*1024*1024,MAX_SELECTED_TOTAL_BYTES=16*1024*1024,MAX_TEXT_BYTES=8*1024*1024;
const MAX_FOLDER_FILES=250;
function u16(d:DataView,o:number){return d.getUint16(o,true);}function u32(d:DataView,o:number){return d.getUint32(o,true);}
function zipMagic(bytes:Uint8Array){return bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&[0x03,0x05,0x07].includes(bytes[2])&&[0x04,0x06,0x08].includes(bytes[3]);}
function pdfMagic(bytes:Uint8Array){return bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;}
async function inflateRaw(bytes:Uint8Array):Promise<Uint8Array>{const ds=new DecompressionStream('deflate-raw');const stream=new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(ds);const out=new Uint8Array(await new Response(stream).arrayBuffer());if(out.byteLength>MAX_SELECTED_ENTRY_BYTES)throw new Error('DOCUMENT_ARCHIVE_ENTRY_TOO_LARGE');return out;}
async function unzip(buffer:ArrayBuffer,wanted:(name:string)=>boolean,onSkipped?:(name:string)=>void){
  const bytes=new Uint8Array(buffer);if(!zipMagic(bytes))throw new Error('DOCUMENT_ZIP_INVALID');const view=new DataView(buffer);let eocd=-1;for(let p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++)if(u32(view,p)===0x06054b50)eocd=p;if(eocd<0)throw new Error('DOCUMENT_ZIP_INVALID');
  const count=u16(view,eocd+10);if(count>MAX_ARCHIVE_ENTRIES)throw new Error('DOCUMENT_ARCHIVE_TOO_MANY_ENTRIES');let p=u32(view,eocd+16),selectedTotal=0;const out=new Map<string,Uint8Array>();
  for(let i=0;i<count;i++){if(p+46>bytes.length||u32(view,p)!==0x02014b50)throw new Error('DOCUMENT_ZIP_INVALID');const method=u16(view,p+10),compressedSize=u32(view,p+20),uncompressedSize=u32(view,p+24),nameLen=u16(view,p+28),extraLen=u16(view,p+30),commentLen=u16(view,p+32),local=u32(view,p+42),name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('DOCUMENT_ARCHIVE_PATH_INVALID');if(!wanted(name))onSkipped?.(name);
    if(wanted(name)){if(uncompressedSize>MAX_SELECTED_ENTRY_BYTES||selectedTotal+uncompressedSize>MAX_SELECTED_TOTAL_BYTES)throw new Error('DOCUMENT_ARCHIVE_EXPANSION_LIMIT');if(local+30>bytes.length||u32(view,local)!==0x04034b50)throw new Error('DOCUMENT_ZIP_INVALID');const ln=u16(view,local+26),le=u16(view,local+28),start=local+30+ln+le,end=start+compressedSize;if(end>bytes.length)throw new Error('DOCUMENT_ZIP_INVALID');const compressed=bytes.subarray(start,end),expanded=method===0?compressed.slice():method===8?await inflateRaw(compressed):(()=>{throw new Error('DOCUMENT_ZIP_COMPRESSION_UNSUPPORTED')})();if(expanded.byteLength>MAX_SELECTED_ENTRY_BYTES)throw new Error('DOCUMENT_ARCHIVE_ENTRY_TOO_LARGE');selectedTotal+=expanded.byteLength;if(selectedTotal>MAX_SELECTED_TOTAL_BYTES)throw new Error('DOCUMENT_ARCHIVE_EXPANSION_LIMIT');out.set(name,expanded);}p+=46+nameLen+extraLen+commentLen;}return out;
}
function xmlText(xml:string){return xml.replace(/<w:tab\/?[^>]*>/gi,'\t').replace(/<w:br\/?[^>]*>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<text:line-break\/?[^>]*>/gi,'\n').replace(/<\/text:p>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim();}
async function docxText(buffer:ArrayBuffer){const f=await unzip(buffer,n=>n==='word/document.xml'||n.startsWith('word/header')||n.startsWith('word/footer'));const parts=[...f.entries()].sort().map(([,b])=>xmlText(decoder.decode(b))).filter(Boolean);return parts.join('\n');}
async function odtText(buffer:ArrayBuffer){const f=await unzip(buffer,n=>n==='content.xml');const b=f.get('content.xml');return b?xmlText(decoder.decode(b)):'';}
// Ein Traeger beschreibt sich selbst als ein flaches Objekt: Name, Anschrift, Kontakt. Gemessen
// im Kundenlauf stand dessen 01_Organisation.json im Pruef-Cockpit als "unsupported" - ausgerechnet
// die Datei mit den Stammdaten. Ein Objekt, dessen Werte allesamt einfache Angaben sind, ist genau
// eine Zeile. Steckt dagegen eine Verschachtelung darin, ist es keine Zeile - dann bleibt es wie
// bisher unlesbar, statt geraten zu werden.
function jsonRows(value:unknown):Record<string,unknown>[]|null{
  if(Array.isArray(value))return value.filter(x=>x&&typeof x==='object') as Record<string,unknown>[];
  if(value&&typeof value==='object'){
    const obj=value as Record<string,unknown>;
    if(Array.isArray(obj.rows))return obj.rows as Record<string,unknown>[];
    const werte=Object.values(obj);
    if(werte.length&&werte.every(v=>v===null||v===undefined||['string','number','boolean'].includes(typeof v)))return[obj];
  }
  return null;
}
function textAllowed(buffer:ArrayBuffer){return buffer.byteLength<=MAX_TEXT_BYTES;}

// Ein hochgeladener Ordner kommt als ZIP an. Er wird ausgepackt und jeder enthaltene Eintrag
// wieder durch dieselbe Erkennung geschickt - eine Ebene tief, damit ein ZIP im ZIP die Grenzen
// nicht umgehen kann. Die vorhandenen Schranken von unzip() gelten unveraendert weiter:
// hoechstens MAX_ARCHIVE_ENTRIES Eintraege, hoechstens MAX_SELECTED_ENTRY_BYTES je Eintrag und
// MAX_SELECTED_TOTAL_BYTES insgesamt. Pfadangriffe weist unzip() bereits ab.
function ignorableEntry(name:string){
  if(name.endsWith('/'))return true;
  const base=name.split('/').pop()||'';
  return !base||base.startsWith('.')||name.startsWith('__MACOSX/');
}
function folderEntryWanted(name:string){
  if(ignorableEntry(name))return false;
  const base=name.split('/').pop()||'';
  // Dieselbe Liste wie fuer einzeln eingeworfene Dateien - sonst verliert ein Kunde, der seinen
  // Ordner als ZIP packt, genau die Unterlagen, die er einzeln haette einwerfen koennen.
  return /\.(?:csv|xlsx|json|txt|docx|odt|pdf|ics|eml|png|jpe?g|webp|tiff?|heic)$/i.test(base);
}
function guessType(name:string){
  const n=name.toLowerCase();
  if(n.endsWith('.csv'))return'text/csv';
  if(n.endsWith('.xlsx'))return'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(n.endsWith('.json'))return'application/json';
  if(n.endsWith('.txt'))return'text/plain';
  if(n.endsWith('.docx'))return'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if(n.endsWith('.odt'))return'application/vnd.oasis.opendocument.text';
  if(n.endsWith('.ics'))return'text/calendar';
  if(n.endsWith('.eml'))return'message/rfc822';
  if(n.endsWith('.pdf'))return'application/pdf';
  return'application/octet-stream';
}
async function extractFolderArchive(buffer:ArrayBuffer):Promise<IntakeExtracted>{
  const entries:{name:string;extracted:IntakeExtracted}[]=[],skipped:string[]=[];
  // Was nicht gelesen werden kann, wird benannt - auch ein Archiv im Archiv, das bewusst nicht
  // geoeffnet wird. Sonst verschwaende eine Datei aus dem Ordner spurlos, und niemand erfuehre es.
  const files=await unzip(buffer,folderEntryWanted,name=>{if(!ignorableEntry(name))skipped.push(name);});
  for(const [name,bytes] of [...files.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    if(entries.length>=MAX_FOLDER_FILES){skipped.push(name);continue;}
    const extracted=await extractIntakeDocument(name,guessType(name),toArrayBuffer(bytes));
    // Ein Archiv im Archiv wird nicht weiter geoeffnet: sonst liesse sich jede Grenze
    // durch Schachteln umgehen. Es wird benannt, nicht stillschweigend verworfen.
    if(extracted.kind==='archive'){skipped.push(name);continue;}
    if(extracted.kind==='unsupported'){skipped.push(name);continue;}
    entries.push({name,extracted});
  }
  if(!entries.length&&!skipped.length)return{kind:'unsupported'};
  return{kind:'archive',entries,skipped};
}

// Kalendereintraege und E-Mails waren die einzigen Unterlagenarten, die ein Kunde einwirft und die
// hier gar nicht erst ankamen: der Ordner-Einwurf filterte .ics und .eml schon im Browser weg, und
// hier haetten sie "unsupported" ergeben. Gemessen an einem echten Abnahmepaket: von 18 Dateien
// wurden 4 nicht uebertragen - der Pruefungskalender und drei Betriebsmails (Raumsperrung,
// Dozentenausfall, Pruefungsverschiebung). Genau die Vorgaenge, die den Betrieb aendern.
//
// Ein Kalender wird als Zeilen gelesen, damit er sich mit einer Pruefungs- oder Stundenplanliste
// zusammenfuehren laesst statt daneben zu stehen. Eine Mail wird als Text gelesen; ueber ihren
// Inhalt entscheidet dieselbe Stelle wie bei einem Word-Dokument.

// RFC 5545: fortgesetzte Zeilen beginnen mit Leerzeichen oder Tabulator.
function unfoldIcs(text:string):string[]{
  const out:string[]=[];
  for(const raw of text.split(/\r?\n/)){
    if(/^[ \t]/.test(raw)&&out.length)out[out.length-1]+=raw.slice(1);
    else out.push(raw);
  }
  return out;
}
function icsValue(v:string):string{return v.replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim();}
// 20260918T090000 / 20260918T090000Z / 20260918 -> Datum und Uhrzeit getrennt, deutsch geschrieben,
// damit die Spalten zu denen einer eingeworfenen Pruefungs- oder Stundenplanliste passen.
function icsMoment(raw:string):{datum:string;zeit:string}{
  const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(raw.trim());
  if(!m)return{datum:'',zeit:''};
  return{datum:`${m[3]}.${m[2]}.${m[1]}`,zeit:m[4]?`${m[4]}:${m[5]}`:''};
}
export function icsRows(text:string):Record<string,unknown>[]{
  const rows:Record<string,unknown>[]=[];
  let feld:Record<string,string>|null=null;
  for(const line of unfoldIcs(text)){
    const trimmed=line.trim();
    if(/^BEGIN:VEVENT$/i.test(trimmed)){feld={};continue;}
    if(/^END:VEVENT$/i.test(trimmed)){
      if(feld){
        const start=icsMoment(feld.DTSTART||''),ende=icsMoment(feld.DTEND||'');
        const titel=feld.SUMMARY||'';
        // "BGB-Klausur 1 (VFA-26-A)" - der Kurs steht in Klammern am Ende. Nur dann wird er
        // uebernommen; geraten wird nichts.
        const klammer=/\(([A-Za-z0-9][A-Za-z0-9._\/-]{1,39})\)\s*$/.exec(titel);
        rows.push({
          Termin_ID:(feld.UID||'').split('@')[0],
          Titel:klammer?titel.slice(0,klammer.index).trim():titel,
          Kurscode:klammer?klammer[1]:'',
          Datum:start.datum,Beginn:start.zeit,Ende:ende.zeit||'',
          Raum:feld.LOCATION||'',Beschreibung:feld.DESCRIPTION||'',
        });
      }
      feld=null;continue;
    }
    if(!feld)continue;
    const i=trimmed.indexOf(':');
    if(i<1)continue;
    const name=trimmed.slice(0,i).split(';')[0].toUpperCase();
    if(['UID','SUMMARY','DTSTART','DTEND','LOCATION','DESCRIPTION'].includes(name))feld[name]=icsValue(trimmed.slice(i+1));
  }
  return rows;
}

// Quoted-printable kodiert Bytes, nicht Zeichen: "=C3=BC" sind die zwei UTF-8-Bytes eines "ü".
// Wer sie einzeln in Zeichen verwandelt, bekommt "Ã¼" - aus "Prüfung" wird "PrÃ¼fung". Deshalb
// erst zu Bytes, dann als UTF-8 lesen.
function decodeQuotedPrintable(body:string):string{
  const ohneUmbruch=body.replace(/=\r?\n/g,'');
  const bytes:number[]=[];
  for(let i=0;i<ohneUmbruch.length;i++){
    const c=ohneUmbruch[i];
    if(c==='='&&/^[0-9A-Fa-f]{2}$/.test(ohneUmbruch.slice(i+1,i+3))){bytes.push(parseInt(ohneUmbruch.slice(i+1,i+3),16));i+=2;continue;}
    for(const b of new TextEncoder().encode(c))bytes.push(b);
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}
// Kopfzeilen tragen Umlaute nach RFC 2047: "=?UTF-8?Q?Pr=C3=BCfung?=" oder base64-kodiert.
// Ohne diese Zeile steht der Betreff einer gewoehnlichen deutschen Mail als Buchstabensalat im
// Pruefungscockpit.
function decodeHeaderWord(value:string):string{
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,(ganz,_zeichensatz,art,inhalt)=>{
    try{
      if(/^[Bb]$/.test(art)){
        const roh=atob(inhalt);const bytes=new Uint8Array(roh.length);
        for(let i=0;i<roh.length;i++)bytes[i]=roh.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
      }
      return decodeQuotedPrintable(inhalt.replace(/_/g,' '));
    }catch{return ganz;}
  });
}
// Aus einer Mail wird der Vorgang, nicht der Umschlag: Betreff, Datum, Absender und der lesbare
// Textteil. Mehrteilige Mails liefern ihren ersten Textteil; ist keiner dabei, bleibt es beim Kopf.
export function emlText(raw:string):string{
  const trenner=raw.indexOf('\r\n\r\n')>=0?'\r\n\r\n':'\n\n';
  const kopfText=raw.slice(0,Math.max(raw.indexOf(trenner),0)||raw.length);
  const kopfZeilen:string[]=[];
  for(const zeile of kopfText.split(/\r?\n/)){
    if(/^[ \t]/.test(zeile)&&kopfZeilen.length)kopfZeilen[kopfZeilen.length-1]+=' '+zeile.trim();
    else kopfZeilen.push(zeile);
  }
  const kopf=(name:string)=>{
    const treffer=kopfZeilen.find(z=>z.toLowerCase().startsWith(name.toLowerCase()+':'));
    return treffer?decodeHeaderWord(treffer.slice(name.length+1).trim()):'';
  };
  let koerper=raw.slice(raw.indexOf(trenner)+trenner.length);
  const grenze=/boundary="?([^";\r\n]+)"?/i.exec(kopfText);
  if(grenze){
    const teile=koerper.split(new RegExp('--'+grenze[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    const text=teile.find(t=>/content-type:\s*text\/plain/i.test(t))||teile.find(t=>t.trim());
    if(text){
      const i=text.indexOf(trenner);
      koerper=i>=0?text.slice(i+trenner.length):text;
      if(/content-transfer-encoding:\s*quoted-printable/i.test(text))koerper=decodeQuotedPrintable(koerper);
    }
  }else if(/content-transfer-encoding:\s*quoted-printable/i.test(kopfText))koerper=decodeQuotedPrintable(koerper);
  const kopfzeile=[['Betreff',kopf('Subject')],['Datum',kopf('Date')],['Von',kopf('From')],['An',kopf('To')]]
    .filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('\n');
  return [kopfzeile,koerper.replace(/\r/g,'').trim()].filter(Boolean).join('\n\n').trim();
}

export async function extractIntakeDocument(filename:string,contentType:string,buffer:ArrayBuffer):Promise<IntakeExtracted>{
  const name=filename.toLowerCase(),type=contentType.toLowerCase(),bytes=new Uint8Array(buffer);
  if(name.endsWith('.zip')||type==='application/zip'||type==='application/x-zip-compressed'){if(!zipMagic(bytes))return{kind:'unsupported'};try{return await extractFolderArchive(buffer);}catch{return{kind:'unsupported'};}}
  if(name.endsWith('.csv')||type==='text/csv'){if(!textAllowed(buffer))return{kind:'unsupported'};const p=parseCsv(decoder.decode(buffer));return{kind:'rows',rows:p.rows};}
  if(name.endsWith('.xlsx')||type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){if(!zipMagic(bytes))return{kind:'unsupported'};const p=await parseXlsx(buffer);return{kind:'rows',rows:p.rows};}
  if(name.endsWith('.json')||type==='application/json'){if(!textAllowed(buffer))return{kind:'unsupported'};try{const rows=jsonRows(JSON.parse(decoder.decode(buffer)));return rows?{kind:'rows',rows}:{kind:'unsupported'};}catch{return{kind:'unsupported'};}}
  if(name.endsWith('.docx')||type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){if(!zipMagic(bytes))return{kind:'unsupported'};const text=await docxText(buffer);return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.odt')||type==='application/vnd.oasis.opendocument.text'){if(!zipMagic(bytes))return{kind:'unsupported'};const text=await odtText(buffer);return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.rtf')||name.endsWith('.html')||name.endsWith('.htm')||type==='application/rtf'||type==='text/rtf'||type==='text/html')return{kind:'unsupported'};
  if(name.endsWith('.txt')||type==='text/plain'){if(!textAllowed(buffer))return{kind:'unsupported'};const text=decoder.decode(buffer).trim();return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.ics')||type==='text/calendar'){if(!textAllowed(buffer))return{kind:'unsupported'};const rows=icsRows(decoder.decode(buffer));return rows.length?{kind:'rows',rows}:{kind:'unsupported'};}
  if(name.endsWith('.eml')||type==='message/rfc822'){if(!textAllowed(buffer))return{kind:'unsupported'};const text=emlText(decoder.decode(buffer));return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.pdf')||type==='application/pdf')return pdfMagic(bytes)?{kind:'client_pdf'}:{kind:'unsupported'};
  if(/\.(?:png|jpe?g|webp|tiff?|heic)$/i.test(name)||type.startsWith('image/'))return{kind:'ocr_required'};
  return{kind:'unsupported'};
}
