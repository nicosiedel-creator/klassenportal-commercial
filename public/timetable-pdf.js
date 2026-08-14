let pdfModulePromise;
const pdfOriginalFiles=new WeakMap();

function norm(v){return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function median(xs){if(!xs.length)return 0;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function escCsv(v){const s=String(v??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function timeMatches(v){return [...String(v??'').matchAll(/\b(?:[01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(x=>x[0].replace('.',':'));}
function dateLike(v){return /(?:^|\D)(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?:\D|$)/.test(String(v??''));}

const headerWords=['datum','date','tag','beginn','start','von','ende','bis','zeit','uhrzeit','fach','modul','lernfeld','dozent','lehrer','lehrkraft','trainer','raum','ort','klasse','kurs','gruppe','unterricht','format'];
function headerScore(cells){let n=0;for(const c of cells){const x=norm(c.text);if(headerWords.some(w=>x===w||x.startsWith(`${w}_`)||x.endsWith(`_${w}`)))n++;}return n;}

async function pdfjs(){
  if(!pdfModulePromise)pdfModulePromise=import('/vendor/pdfjs/pdf.mjs').then(m=>{m.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';return m;});
  return pdfModulePromise;
}

function textLines(items,pageNo){
  const parts=items.filter(x=>x&&typeof x.str==='string'&&x.str.trim()&&Array.isArray(x.transform)).map(x=>({
    text:x.str.trim(),x:Number(x.transform[4]||0),y:Number(x.transform[5]||0),w:Number(x.width||0),h:Math.max(6,Math.abs(Number(x.transform[3]||x.height||10)))
  })).sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const p of parts){
    let line=lines.find(l=>Math.abs(l.y-p.y)<=Math.max(2.5,Math.min(6,p.h*.45)));
    if(!line){line={page:pageNo,y:p.y,items:[]};lines.push(line);}
    line.items.push(p);line.y=(line.y*(line.items.length-1)+p.y)/line.items.length;
  }
  lines.sort((a,b)=>b.y-a.y);
  for(const line of lines){
    line.items.sort((a,b)=>a.x-b.x);
    const widths=line.items.map(i=>i.text.length?i.w/i.text.length:0).filter(x=>x>0&&Number.isFinite(x));
    const gapLimit=Math.max(9,median(widths)*2.2);
    const cells=[];let current=null;
    for(const it of line.items){
      const end=current?current.x+current.w:0,gap=current?it.x-end:Infinity;
      if(!current||gap>gapLimit){current={x:it.x,w:Math.max(it.w,1),text:it.text};cells.push(current);}
      else{current.text=`${current.text} ${it.text}`.replace(/\s+/g,' ').trim();current.w=Math.max(current.w,it.x+Math.max(it.w,1)-current.x);}
    }
    line.cells=cells;
  }
  return lines.filter(l=>l.cells.length);
}

function uniqueHeaders(headers){const used=new Map();return headers.map((h,i)=>{let base=String(h||'').trim()||`Spalte ${i+1}`;const key=norm(base)||`spalte_${i+1}`,n=(used.get(key)||0)+1;used.set(key,n);return n===1?base:`${base} ${n}`;});}
function assignLine(line,anchors){
  const out=Array(anchors.length).fill('');
  const bounds=anchors.slice(0,-1).map((x,i)=>(x+anchors[i+1])/2);
  for(const c of line.cells){let idx=0;while(idx<bounds.length&&c.x>=bounds[idx])idx++;out[idx]=out[idx]?`${out[idx]} ${c.text}`:c.text;}
  return out.map(x=>x.replace(/\s+/g,' ').trim());
}
function inferHeaders(headers,rows,hadHeader){
  const out=[...headers];
  const stats=out.map((_,i)=>{const vals=rows.map(r=>r[i]).filter(Boolean);const n=Math.max(1,vals.length);return{date:vals.filter(dateLike).length/n,time:vals.filter(v=>timeMatches(v).length===1).length/n,pair:vals.filter(v=>timeMatches(v).length>=2).length/n,sample:vals.find(Boolean)||''};});
  let dateIndex=out.findIndex(h=>['datum','date','tag','unterrichtstag','schultag'].includes(norm(h)));
  if(dateIndex<0){dateIndex=stats.findIndex(s=>s.date>=.35);if(dateIndex>=0)out[dateIndex]='Datum';}
  let rangeIndex=out.findIndex(h=>['zeit','uhrzeit','zeitraum','von_bis','unterrichtszeit'].includes(norm(h))&&stats[out.indexOf(h)]?.pair>=.25);
  if(rangeIndex<0)rangeIndex=stats.findIndex(s=>s.pair>=.45);
  if(rangeIndex>=0){
    out.splice(rangeIndex,1,'Beginn','Ende');
    for(const r of rows){const ts=timeMatches(r[rangeIndex]);r.splice(rangeIndex,1,ts[0]||'',ts[1]||'');}
  }
  const startKnown=out.some(h=>['beginn','start','von','startzeit'].includes(norm(h))),endKnown=out.some(h=>['ende','end','bis','endzeit','schluss'].includes(norm(h)));
  if(!startKnown||!endKnown){const timeCols=[];for(let i=0;i<out.length;i++){const vals=rows.map(r=>r[i]).filter(Boolean),ratio=vals.length?vals.filter(v=>timeMatches(v).length===1).length/vals.length:0;if(ratio>=.4)timeCols.push(i);}
    if(!startKnown&&timeCols[0]!==undefined)out[timeCols[0]]='Beginn';
    if(!endKnown&&timeCols[1]!==undefined)out[timeCols[1]]='Ende';
  }
  if(!hadHeader)for(let i=0;i<out.length;i++)if(/^Spalte \d+$/.test(out[i])&&stats[i]?.sample)out[i]=`${out[i]} – z. B. ${String(stats[i].sample).slice(0,32)}`;
  return uniqueHeaders(out);
}

async function pdfToCsv(file){
  const lib=await pdfjs(),data=new Uint8Array(await file.arrayBuffer());
  const task=lib.getDocument({data,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
  const pdf=await task.promise,all=[];let chars=0;
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p),content=await page.getTextContent();
    for(const item of content.items)if(typeof item.str==='string')chars+=item.str.trim().length;
    all.push(...textLines(content.items,p));
  }
  await pdf.destroy();
  if(chars<20)throw new Error('TIMETABLE_PDF_NO_TEXT');
  const flat=all.filter(l=>l.cells.length>=2),scored=flat.map((l,i)=>({i,l,score:headerScore(l.cells)})).sort((a,b)=>b.score-a.score||a.i-b.i);
  const hit=scored[0]?.score>=2?scored[0]:null;
  let anchors,headers,dataLines,hadHeader=!!hit;
  if(hit){anchors=hit.l.cells.map(c=>c.x);headers=hit.l.cells.map(c=>c.text);dataLines=flat.slice(hit.i+1).filter(l=>headerScore(l.cells)<2);}
  else{
    const candidates=flat.filter(l=>l.cells.length>=3&&l.cells.length<=12);if(!candidates.length)throw new Error('TIMETABLE_PDF_TABLE_NOT_FOUND');
    const template=[...candidates].sort((a,b)=>b.cells.length-a.cells.length)[0];anchors=template.cells.map(c=>c.x);headers=anchors.map((_,i)=>`Spalte ${i+1}`);dataLines=flat;
  }
  if(anchors.length<3)throw new Error('TIMETABLE_PDF_TABLE_NOT_FOUND');
  let rows=dataLines.map(l=>assignLine(l,anchors)).filter(r=>r.filter(Boolean).length>=2);
  rows=rows.filter(r=>r.some(dateLike)||r.reduce((n,v)=>n+timeMatches(v).length,0)>=2);
  if(!rows.length)throw new Error('TIMETABLE_PDF_TABLE_NOT_FOUND');
  headers=inferHeaders(uniqueHeaders(headers),rows,hadHeader);
  const dateIndex=headers.findIndex(h=>['datum','date','tag','unterrichtstag','schultag'].includes(norm(h)));if(dateIndex>=0){let last='';for(const r of rows){if(dateLike(r[dateIndex]))last=r[dateIndex];else if(!r[dateIndex]&&last)r[dateIndex]=last;}}
  const width=Math.max(headers.length,...rows.map(r=>r.length));while(headers.length<width)headers.push(`Spalte ${headers.length+1}`);for(const r of rows)while(r.length<width)r.push('');
  const csv=[headers,...rows].map(r=>r.map(escCsv).join(',')).join('\r\n');
  const name=file.name.replace(/\.pdf$/i,'')+'__pdf_ausgelesen.csv';
  return new File([csv],name,{type:'text/csv',lastModified:file.lastModified});
}

function friendly(code){return({
  TIMETABLE_PDF_NO_TEXT:'In diesem PDF wurde kein auslesbarer Text gefunden. Es handelt sich wahrscheinlich um ein Scan-/Bild-PDF. Dafür ist eine OCR-Texterkennung erforderlich.',
  TIMETABLE_PDF_TABLE_NOT_FOUND:'Der PDF-Text wurde gelesen, aber keine ausreichend klare Stundenplantabelle erkannt. Bitte ein tabellarisches PDF, Excel oder CSV verwenden.'
})[code]||code;}

async function preparePdfInput(input){
  const file=input.files?.[0];if(!file||!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')))return;
  const modal=input.closest('.modal'),status=modal?.querySelector('#tti-status'),preview=modal?.querySelector('#tti-preview');
  if(preview)preview.disabled=true;if(status)status.textContent='PDF wird ausgelesen und die Tabelle wird erkannt …';
  try{
    pdfOriginalFiles.set(input,file);
    const csv=await pdfToCsv(file),dt=new DataTransfer();dt.items.add(csv);input.files=dt.files;
    input.dataset.pdfSource=file.name;if(status)status.textContent=`PDF erfolgreich ausgelesen: ${file.name}`;
  }catch(e){input.value='';pdfOriginalFiles.delete(input);if(status)status.textContent=friendly(e?.message||'PDF_LESEN_FEHLGESCHLAGEN');}
  finally{if(preview)preview.disabled=false;}
}

function enhance(){
  document.querySelectorAll('#tti-file').forEach(input=>{
    if(input.dataset.pdfEnhanced==='1')return;input.dataset.pdfEnhanced='1';input.accept='.xlsx,.csv,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.addEventListener('change',()=>preparePdfInput(input));
    const modal=input.closest('.modal');if(modal){for(const el of modal.querySelectorAll('.muted'))if(el.textContent?.includes('Excel oder CSV'))el.textContent=el.textContent.replace('Excel oder CSV','Excel, CSV oder PDF');}
  });
  document.querySelectorAll('.content .muted').forEach(el=>{if(el.textContent?.includes('Excel/CSV automatisch'))el.textContent=el.textContent.replace('Excel/CSV automatisch','Excel/CSV/PDF automatisch');});
}

new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});enhance();
