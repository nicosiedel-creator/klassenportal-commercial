// Baut ein echtes ZIP-Archiv im Speicher. Bewusst kein fremdes Paket: der Test soll genau das
// Format erzeugen, das ein Betriebssystem beim Zippen eines Ordners schreibt, und beide
// Ablageverfahren abdecken - unkomprimiert (0) und deflate (8).
const encoder=new TextEncoder();
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
async function deflateRaw(bytes){const cs=new CompressionStream('deflate-raw');const stream=new Blob([bytes]).stream().pipeThrough(cs);return new Uint8Array(await new Response(stream).arrayBuffer());}

export async function buildZip(entries,{deflate=false}={}){
  const locals=[],central=[];let offset=0;
  for(const [name,content] of entries){
    const nameBytes=encoder.encode(name),raw=typeof content==='string'?encoder.encode(content):content;
    const stored=deflate?await deflateRaw(raw):raw,method=deflate?8:0,crc=crc32(raw);
    const local=new Uint8Array(30+nameBytes.length+stored.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,method,true);
    lv.setUint16(10,0,true);lv.setUint16(12,0,true);lv.setUint32(14,crc,true);
    lv.setUint32(18,stored.length,true);lv.setUint32(22,raw.length,true);
    lv.setUint16(26,nameBytes.length,true);lv.setUint16(28,0,true);
    local.set(nameBytes,30);local.set(stored,30+nameBytes.length);
    const dir=new Uint8Array(46+nameBytes.length),dv=new DataView(dir.buffer);
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0,true);
    dv.setUint16(10,method,true);dv.setUint16(12,0,true);dv.setUint16(14,0,true);dv.setUint32(16,crc,true);
    dv.setUint32(20,stored.length,true);dv.setUint32(24,raw.length,true);
    dv.setUint16(28,nameBytes.length,true);dv.setUint16(30,0,true);dv.setUint16(32,0,true);
    dv.setUint16(34,0,true);dv.setUint16(36,0,true);dv.setUint32(38,0,true);dv.setUint32(42,offset,true);
    dir.set(nameBytes,46);
    locals.push(local);central.push(dir);offset+=local.length;
  }
  const centralSize=central.reduce((n,x)=>n+x.length,0);
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
  ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const total=offset+centralSize+22,out=new Uint8Array(total);let p=0;
  for(const x of locals){out.set(x,p);p+=x.length;}
  for(const x of central){out.set(x,p);p+=x.length;}
  out.set(end,p);
  return out.buffer;
}
