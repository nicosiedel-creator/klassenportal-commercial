// Diese Seite laedt das gemeinsame Fehlerwoerterbuch nicht - der Worker rendert sie und bringt
// nur dieses Skript mit. Ohne eigene Zuordnung stand hier ein technischer Code wie
// UPLOAD_TOO_LARGE vor einem Menschen, der eine Datei hochladen wollte.
const INTAKE_FEHLER={
  UPLOAD_FAILED:'Der Upload konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
  UPLOAD_TOO_LARGE:'Die Datei ist zu groß.',
  FILE_TOO_LARGE:'Die Datei ist zu groß.',
  FILE_TYPE_NOT_ALLOWED:'Dieser Dateityp ist nicht zugelassen.',
  INTAKE_LINK_INVALID:'Dieser Upload-Link ist ungültig.',
  INTAKE_LINK_EXPIRED:'Dieser Upload-Link ist abgelaufen.',
  INTAKE_DISABLED:'Der Upload ist derzeit nicht möglich.',
  FILES_REQUIRED:'Bitte zuerst eine Datei auswählen.',
};
function uploadFehler(x){
  // Wie im gemeinsamen Woerterbuch: nur eine echte Zeichenkette zaehlt als Meldung, sonst
  // stuende hier "Error" oder "[object Object]" vor dem Benutzer.
  const raw=x&&typeof x.message==='string'?x.message:(typeof x==='string'?x:'');
  const code=String(raw).trim();
  if(INTAKE_FEHLER[code])return INTAKE_FEHLER[code];
  if(!code||/^[A-Z][A-Z0-9_]{2,}$/.test(code))return INTAKE_FEHLER.UPLOAD_FAILED;
  return code;
}
const form=document.querySelector('#f'),status=document.querySelector('#s'),progress=document.querySelector('#p'),input=document.querySelector('#files');
const folderInput=document.querySelector('#folder'),folderButton=document.querySelector('#pickFolder');
// Ein Ordner enthaelt fast immer auch Dinge, die hier nichts zu suchen haben: versteckte
// Dateien, .DS_Store, Bilder aus einer Signatur. Sie werden vorher aussortiert, damit niemand
// vor dem Hochladen sortieren muss.
const SUPPORTED=/\.(?:pdf|csv|xlsx|json|txt|docx|odt|zip|png|jpe?g|webp|tiff?|heic)$/i;
function usable(list){return [...list].filter(f=>f.size>0&&SUPPORTED.test(f.name)&&!f.name.startsWith('.')&&!/(^|\/)__MACOSX\//.test(f.webkitRelativePath||''));}
let selected=[],droppedCount=0;
function remember(list,label){const all=[...list];selected=usable(all);droppedCount=all.length-selected.length;
  if(status)status.textContent=selected.length?`${selected.length} Datei(en) aus ${label} bereit.${droppedCount?` ${droppedCount} nicht lesbare übersprungen.`:''}`:`In ${label} ist keine lesbare Unterlage.`;}
if(folderButton&&folderInput){folderButton.addEventListener('click',()=>folderInput.click());folderInput.addEventListener('change',()=>remember(folderInput.files||[],'dem Ordner'));}
if(input)input.addEventListener('change',()=>remember(input.files||[],'der Auswahl'));
function token(){const m=location.pathname.match(/^\/eingang\/([^/]+)$/);return m?decodeURIComponent(m[1]):'';}
async function pdfText(file){const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;let text='';for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),c=await page.getTextContent();text+='\n'+c.items.map(x=>'str'in x?x.str+(x.hasEOL?'\n':' '):'').join('');}return text.replace(/[-\s]/g,'').length>=20?text.slice(0,300000):'';}
if(form&&status&&progress&&input){form.addEventListener('submit',async e=>{e.preventDefault();const files=selected.length?selected:usable(input.files||[]);if(!files.length){status.textContent='Bitte zuerst Dateien oder einen Ordner auswählen.';return;}if(files.length>100){status.textContent='Mehr als 100 Dateien: bitte den Ordner als ZIP-Datei einreichen, dann wird er in einem Zug eingelesen.';return;}const raw=token();if(!raw){status.textContent='Upload-Link ist ungültig.';return;}const fd=new FormData();progress.hidden=false;status.textContent='Unterlagen werden sicher übertragen …';try{for(let i=0;i<files.length;i++){const file=files[i];fd.append('files',file);if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){try{const text=await pdfText(file);if(text)fd.append(`client_text_${i}`,text);}catch{}}}const r=await fetch(`/api/intake/upload/${encodeURIComponent(raw)}`,{method:'POST',credentials:'omit',body:fd}),d=await r.json();if(!r.ok)throw new Error(d.error||'UPLOAD_FAILED');status.textContent=`Fertig. Vorgang: ${d.batch_id} · ${d.status}`;form.reset();selected=[];droppedCount=0;}catch(x){status.textContent=`Upload fehlgeschlagen: ${uploadFehler(x)}`;}finally{progress.hidden=true;}});}
