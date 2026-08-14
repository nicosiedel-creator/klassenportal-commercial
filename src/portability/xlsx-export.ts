import { createZipStream, type ZipEntry } from './zip.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function col(n: number): string { let s=''; for(let x=n+1;x>0;x=Math.floor((x-1)/26)) s=String.fromCharCode(65+((x-1)%26))+s; return s; }

export async function xlsxFromRows(headers: string[], rows: Record<string, unknown>[]): Promise<Uint8Array> {
  const xmlRows: string[] = [];
  const all = [Object.fromEntries(headers.map((h) => [h, h])), ...rows];
  all.forEach((row, ri) => {
    const cells = headers.map((h, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(row[h])}</t></is></c>`).join('');
    xmlRows.push(`<row r="${ri + 1}">${cells}</row>`);
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows.join('')}</sheetData></worksheet>`;
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', body: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: '_rels/.rels', body: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', body: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', body: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', body: sheet },
  ];
  const ab = await new Response(createZipStream(entries)).arrayBuffer();
  return new Uint8Array(ab);
}
