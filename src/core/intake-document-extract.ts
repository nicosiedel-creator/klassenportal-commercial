import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { toArrayBuffer } from './utils.js';

export type IntakeExtracted=
  |{kind:'rows';rows:Record<string,unknown>[]}
  |{kind:'texts';texts:string[]}
  |{kind:'client_pdf'}
  |{kind:'ocr_required'}
  |{kind:'unsupported'};

const decoder=new TextDecoder();
function u16(d:DataView,o:number){return d.getUint16(o,true);}function u32(d:DataView,o:number){return d.getUint32(o,true);}
async function inflateRaw(bytes:Uint8Array):Promise<Uint8Array>{const ds=new DecompressionStream('deflate-raw');const stream=new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(ds);return new Uint8Array(await new Response(stream).arrayBuffer());}
async function unzip(buffer:ArrayBuffer,wanted:(name:string)=>boolean){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);let eocd=-1;for(let p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++)if(u32(view,p)===0x06054b50)eocd=p;if(eocd<0)throw new Error('DOCUMENT_ZIP_INVALID');
  const count=u16(view,eocd+10);let p=u32(view,eocd+16);const out=new Map<string,Uint8Array>();
  for(let i=0;i<count;i++){if(u32(view,p)!==0x02014b50)throw new Error('DOCUMENT_ZIP_INVALID');const method=u16(view,p+10),size=u32(view,p+20),nameLen=u16(view,p+28),extraLen=u16(view,p+30),commentLen=u16(view,p+32),local=u32(view,p+42),name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));if(wanted(name)){if(u32(view,local)!==0x04034b50)throw new Error('DOCUMENT_ZIP_INVALID');const ln=u16(view,local+26),le=u16(view,local+28),start=local+30+ln+le,compressed=bytes.subarray(start,start+size);out.set(name,method===0?compressed.slice():method===8?await inflateRaw(compressed):(()=>{throw new Error('DOCUMENT_ZIP_COMPRESSION_UNSUPPORTED')})());}p+=46+nameLen+extraLen+commentLen;}return out;
}
function xmlText(xml:string){return xml.replace(/<w:tab\/?[^>]*>/gi,'\t').replace(/<w:br\/?[^>]*>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<text:line-break\/?[^>]*>/gi,'\n').replace(/<\/text:p>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim();}
async function docxText(buffer:ArrayBuffer){const f=await unzip(buffer,n=>n==='word/document.xml'||n.startsWith('word/header')||n.startsWith('word/footer'));const parts=[...f.entries()].sort().map(([,b])=>xmlText(decoder.decode(b))).filter(Boolean);return parts.join('\n');}
async function odtText(buffer:ArrayBuffer){const f=await unzip(buffer,n=>n==='content.xml');const b=f.get('content.xml');return b?xmlText(decoder.decode(b)):'';}
function rtfText(raw:string){return raw.replace(/\\par[d]?\b/g,'\n').replace(/\\tab\b/g,'\t').replace(/\\'[0-9a-fA-F]{2}/g,m=>String.fromCharCode(parseInt(m.slice(2),16))).replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}]/g,'').replace(/\\([{}\\])/g,'$1').replace(/[ \t]+/g,' ').trim();}
function htmlText(raw:string){return raw.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<(?:br|\/p|\/div|\/li|\/tr)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/[ \t]+/g,' ').trim();}
function jsonRows(value:unknown):Record<string,unknown>[]|null{if(Array.isArray(value))return value.filter(x=>x&&typeof x==='object') as Record<string,unknown>[];if(value&&typeof value==='object'&&Array.isArray((value as any).rows))return (value as any).rows;return null;}

export async function extractIntakeDocument(filename:string,contentType:string,buffer:ArrayBuffer):Promise<IntakeExtracted>{
  const name=filename.toLowerCase(),type=contentType.toLowerCase();
  if(name.endsWith('.csv')||type==='text/csv'){const p=parseCsv(decoder.decode(buffer));return{kind:'rows',rows:p.rows};}
  if(name.endsWith('.xlsx')||type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const p=await parseXlsx(buffer);return{kind:'rows',rows:p.rows};}
  if(name.endsWith('.json')||type==='application/json'){try{const rows=jsonRows(JSON.parse(decoder.decode(buffer)));return rows?{kind:'rows',rows}:{kind:'unsupported'};}catch{return{kind:'unsupported'};}}
  if(name.endsWith('.docx')||type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){const text=await docxText(buffer);return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.odt')||type==='application/vnd.oasis.opendocument.text'){const text=await odtText(buffer);return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.rtf')||type==='application/rtf'||type==='text/rtf'){const text=rtfText(decoder.decode(buffer));return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.html')||name.endsWith('.htm')||type==='text/html'){const text=htmlText(decoder.decode(buffer));return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.txt')||type.startsWith('text/')){const text=decoder.decode(buffer).trim();return text?{kind:'texts',texts:[text]}:{kind:'unsupported'};}
  if(name.endsWith('.pdf')||type==='application/pdf')return{kind:'client_pdf'};
  if(/\.(?:png|jpe?g|webp|tiff?|heic)$/i.test(name)||type.startsWith('image/'))return{kind:'ocr_required'};
  return{kind:'unsupported'};
}
