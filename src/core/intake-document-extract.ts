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
function jsonRows(value:unknown):Record<string,unknown>[]|null{if(Array.isArray(value))return value.filter(x=>x&&typeof x==='object') as Record<string,unknown>[];if(value&&typeof value==='object'&&Array.isArray((value as any).rows))return (value as any).rows;return null;}
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
  return /\.(?:csv|xlsx|json|txt|docx|odt|pdf|png|jpe?g|webp|tiff?|heic)$/i.test(base);
}
function guessType(name:string){
  const n=name.toLowerCase();
  if(n.endsWith('.csv'))return'text/csv';
  if(n.endsWith('.xlsx'))return'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(n.endsWith('.json'))return'application/json';
  if(n.endsWith('.txt'))return'text/plain';
  if(n.endsWith('.docx'))return'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if(n.endsWith('.odt'))return'application/vnd.oasis.opendocument.text';
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
  if(name.endsWith('.pdf')||type==='application/pdf')return pdfMagic(bytes)?{kind:'client_pdf'}:{kind:'unsupported'};
  if(/\.(?:png|jpe?g|webp|tiff?|heic)$/i.test(name)||type.startsWith('image/'))return{kind:'ocr_required'};
  return{kind:'unsupported'};
}
