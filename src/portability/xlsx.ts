import { normalizeHeader, textDecoder, toArrayBuffer } from './utils.js';

const MAX_ARCHIVE_ENTRIES=5000;
const MAX_SELECTED_ENTRY_BYTES=24*1024*1024;
const MAX_SELECTED_TOTAL_BYTES=48*1024*1024;
const MAX_ROWS=50_000;
const MAX_COLUMNS=500;
const MAX_SHARED_STRINGS=250_000;
const MAX_CELL_TEXT=100_000;
function u16(d:DataView,o:number):number{return d.getUint16(o,true);} function u32(d:DataView,o:number):number{return d.getUint32(o,true);}
function zipMagic(bytes:Uint8Array){return bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b;}
async function inflateRaw(bytes:Uint8Array,maxBytes:number):Promise<Uint8Array>{const ds=new DecompressionStream('deflate-raw');const stream=new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(ds),reader=stream.getReader();let total=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;const chunk=value instanceof Uint8Array?value:new Uint8Array(value);total+=chunk.byteLength;if(total>maxBytes){await reader.cancel().catch(()=>undefined);throw new Error('XLSX_ARCHIVE_EXPANSION_LIMIT');}chunks.push(chunk);}const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}return out;}
async function unzipSelected(buffer:ArrayBuffer,wanted:(name:string)=>boolean):Promise<Map<string,Uint8Array>>{
  const bytes=new Uint8Array(buffer);if(!zipMagic(bytes))throw new Error('XLSX_ZIP_INVALID');const view=new DataView(buffer);let eocd=-1;for(let p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++){if(u32(view,p)===0x06054b50)eocd=p;}if(eocd<0)throw new Error('XLSX_ZIP_EOCD_MISSING');
  const entryCount=u16(view,eocd+10);if(entryCount>MAX_ARCHIVE_ENTRIES)throw new Error('XLSX_ARCHIVE_TOO_MANY_ENTRIES');let p=u32(view,eocd+16),selectedTotal=0;const out=new Map<string,Uint8Array>();
  for(let i=0;i<entryCount;i++){if(p+46>bytes.length||u32(view,p)!==0x02014b50)throw new Error('XLSX_ZIP_CENTRAL_DIRECTORY_INVALID');const method=u16(view,p+10),compressedSize=u32(view,p+20),uncompressedSize=u32(view,p+24),nameLen=u16(view,p+28),extraLen=u16(view,p+30),commentLen=u16(view,p+32),localOffset=u32(view,p+42),name=textDecoder.decode(bytes.subarray(p+46,p+46+nameLen));if(name.includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('XLSX_ARCHIVE_PATH_INVALID');if(wanted(name)){if(uncompressedSize>MAX_SELECTED_ENTRY_BYTES||selectedTotal+uncompressedSize>MAX_SELECTED_TOTAL_BYTES)throw new Error('XLSX_ARCHIVE_EXPANSION_LIMIT');if(localOffset+30>bytes.length||u32(view,localOffset)!==0x04034b50)throw new Error('XLSX_ZIP_LOCAL_HEADER_INVALID');const localNameLen=u16(view,localOffset+26),localExtraLen=u16(view,localOffset+28),dataStart=localOffset+30+localNameLen+localExtraLen,dataEnd=dataStart+compressedSize;if(dataEnd>bytes.length)throw new Error('XLSX_ZIP_INVALID');const compressed=bytes.subarray(dataStart,dataEnd);let data:Uint8Array;if(method===0){if(compressed.byteLength>MAX_SELECTED_ENTRY_BYTES)throw new Error('XLSX_ARCHIVE_EXPANSION_LIMIT');data=compressed.slice();}else if(method===8)data=await inflateRaw(compressed,Math.min(MAX_SELECTED_ENTRY_BYTES,MAX_SELECTED_TOTAL_BYTES-selectedTotal));else throw new Error(`XLSX_UNSUPPORTED_COMPRESSION_${method}`);selectedTotal+=data.byteLength;if(selectedTotal>MAX_SELECTED_TOTAL_BYTES)throw new Error('XLSX_ARCHIVE_EXPANSION_LIMIT');out.set(name,data);}p+=46+nameLen+extraLen+commentLen;}
  return out;
}
function xmlUnescape(s:string):string{const out=s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');if(out.length>MAX_CELL_TEXT)throw new Error('XLSX_CELL_TOO_LARGE');return out;}
// Excel schreibt eine formatierte, aber leere Zelle selbstschliessend: <c r="A1" s="1"/>.
// Ein Muster, das immer ein </c> verlangt, verschluckt an dieser Stelle die naechste Zelle
// mitsamt ihrem Wert: aus einer Kursliste wurde eine Kopfzeile ["0",null,"course_code"] und der
// Kursname verschwand. Deshalb werden beide Schreibweisen erkannt - selbstschliessend ohne
// Rumpf, sonst mit Rumpf bis zum eigenen </c>. Die Spaltennummer steht ohnehin im r-Attribut,
// eine uebersprungene Leerzelle verschiebt also nichts.
const CELL_PATTERN=/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g;
function columnIndex(ref:string):number{const letters=(ref.match(/[A-Z]+/i)?.[0]??'A').toUpperCase();let n=0;for(const c of letters)n=n*26+(c.charCodeAt(0)-64);const index=n-1;if(index>=MAX_COLUMNS)throw new Error('XLSX_TOO_MANY_COLUMNS');return index;}
export async function parseXlsx(buffer:ArrayBuffer):Promise<{headers:string[];rows:Record<string,unknown>[]}>{
 const files=await unzipSelected(buffer,n=>n==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/.test(n)); const sharedXml=files.get('xl/sharedStrings.xml');const shared:string[]=[];if(sharedXml){const xml=textDecoder.decode(sharedXml);for(const m of xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)){if(shared.length>=MAX_SHARED_STRINGS)throw new Error('XLSX_TOO_MANY_SHARED_STRINGS');const parts=[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>xmlUnescape(x[1]));const joined=parts.join('');if(joined.length>MAX_CELL_TEXT)throw new Error('XLSX_CELL_TOO_LARGE');shared.push(joined);}}
 const sheetName=[...files.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];if(!sheetName)throw new Error('XLSX_NO_WORKSHEET');const xml=textDecoder.decode(files.get(sheetName)!);const matrix:unknown[][]=[];
 for(const rm of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)){if(matrix.length>=MAX_ROWS+1)throw new Error('XLSX_TOO_MANY_ROWS');const row:unknown[]=[];for(const cm of rm[1].matchAll(CELL_PATTERN)){const attrs=cm[1]??'',body=cm[2]??'';const ref=/\br="([^"]+)"/.exec(attrs)?.[1]??`A${matrix.length+1}`;const type=/\bt="([^"]+)"/.exec(attrs)?.[1]??'n';const v=/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]??'';if(v.length>MAX_CELL_TEXT)throw new Error('XLSX_CELL_TOO_LARGE');const idx=columnIndex(ref);if(type==='s')row[idx]=shared[Number(v)]??'';else if(type==='inlineStr')row[idx]=xmlUnescape(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body)?.[1]??'');else if(type==='b')row[idx]=v==='1';else if(v!==''&&Number.isFinite(Number(v)))row[idx]=Number(v);else row[idx]=xmlUnescape(v);}matrix.push(row);}
 if(!matrix.length)return{headers:[],rows:[]};const headers=matrix[0].map((h,i)=>normalizeHeader(String(h??''))||`spalte_${i+1}`);const rows=matrix.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map(r=>{const obj:Record<string,unknown>={};headers.forEach((h,i)=>{obj[h]=r[i]??'';});return obj;});return{headers,rows};
}
