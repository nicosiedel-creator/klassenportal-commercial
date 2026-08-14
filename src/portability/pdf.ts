import { textEncoder } from './utils.js';

function escapePdf(s: string): string { return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
export function simplePdf(title: string, lines: string[]): Uint8Array {
  const pageSize = 44;
  const pages = [] as string[][];
  for (let i=0;i<lines.length;i+=pageSize) pages.push(lines.slice(i,i+pageSize));
  if (!pages.length) pages.push([]);
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageIds:number[]=[]; const contentIds:number[]=[];
  let next=4;
  for(let i=0;i<pages.length;i++){ pageIds.push(next++); contentIds.push(next++); }
  const fontId=3;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((pl,pi)=>{
    objects[pageIds[pi]]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[pi]} 0 R >>`;
    let y=800; const cmds=['BT','/F1 16 Tf',`50 ${y} Td`,`(${escapePdf(pi===0?title:`${title} – Fortsetzung`)}) Tj`,'/F1 10 Tf']; y-=26;
    for(const line of pl){ cmds.push(`1 0 0 1 50 ${y} Tm`,`(${escapePdf(line.slice(0,115))}) Tj`); y-=16; }
    cmds.push('ET'); const stream=cmds.join('\n');
    objects[contentIds[pi]]=`<< /Length ${textEncoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  let body='%PDF-1.4\n'; const offsets=[0];
  for(let i=1;i<objects.length;i++){ offsets[i]=textEncoder.encode(body).length; body+=`${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=textEncoder.encode(body).length;
  body+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++) body+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  body+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return textEncoder.encode(body);
}
