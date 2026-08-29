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
  const code=String((x&&x.message)||x||'').trim();
  if(INTAKE_FEHLER[code])return INTAKE_FEHLER[code];
  if(!code||/^[A-Z][A-Z0-9_]{2,}$/.test(code))return INTAKE_FEHLER.UPLOAD_FAILED;
  return code;
}
const form=document.querySelector('#f'),status=document.querySelector('#s'),progress=document.querySelector('#p'),input=document.querySelector('#files');
function token(){const m=location.pathname.match(/^\/eingang\/([^/]+)$/);return m?decodeURIComponent(m[1]):'';}
async function pdfText(file){const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:await file.arrayBuffer(),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;let text='';for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),c=await page.getTextContent();text+='\n'+c.items.map(x=>'str'in x?x.str+(x.hasEOL?'\n':' '):'').join('');}return text.replace(/[-\s]/g,'').length>=20?text.slice(0,300000):'';}
if(form&&status&&progress&&input){form.addEventListener('submit',async e=>{e.preventDefault();const files=[...input.files];if(!files.length)return;const raw=token();if(!raw){status.textContent='Upload-Link ist ungültig.';return;}const fd=new FormData();progress.hidden=false;status.textContent='Unterlagen werden sicher übertragen …';try{for(let i=0;i<files.length;i++){const file=files[i];fd.append('files',file);if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){try{const text=await pdfText(file);if(text)fd.append(`client_text_${i}`,text);}catch{}}}const r=await fetch(`/api/intake/upload/${encodeURIComponent(raw)}`,{method:'POST',credentials:'omit',body:fd}),d=await r.json();if(!r.ok)throw new Error(d.error||'UPLOAD_FAILED');status.textContent=`Fertig. Vorgang: ${d.batch_id} · ${d.status}`;form.reset();}catch(x){status.textContent=`Upload fehlgeschlagen: ${uploadFehler(x)}`;}finally{progress.hidden=true;}});}
