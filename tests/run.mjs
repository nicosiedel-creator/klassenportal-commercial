import { strict as assert } from 'node:assert';
import { parseCsv } from '../dist/portability/csv.js';
import { xlsxFromRows } from '../dist/portability/xlsx-export.js';
import { parseXlsx } from '../dist/portability/xlsx.js';
import { simplePdf } from '../dist/portability/pdf.js';
import { createZipStream } from '../dist/portability/zip.js';

const c = parseCsv('Name;Datum\r\nTest;2026-08-14\r\n"A;B";x\r\n');
assert.deepEqual(c.headers, ['name','datum']);
assert.equal(c.rows.length, 2);
assert.equal(c.rows[1].name, 'A;B');

const x = await xlsxFromRows(['name','wert'], [{name:'Alpha',wert:12},{name:'Beta',wert:'x'}]);
assert.ok(x.byteLength > 500);
const xp = await parseXlsx(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength));
assert.deepEqual(xp.headers, ['name','wert']);
assert.equal(xp.rows.length, 2);
assert.equal(xp.rows[0].name, 'Alpha');

const pdf = simplePdf('Test', Array.from({length:120},(_,i)=>`Zeile ${i+1}`));
assert.ok(new TextDecoder().decode(pdf.slice(0,8)).startsWith('%PDF-1.4'));
assert.ok(pdf.byteLength > 2000);

const zip = await new Response(createZipStream([{name:'a.txt',body:'Hallo'},{name:'b.txt',body:new TextEncoder().encode('Welt')}])).arrayBuffer();
const z = new Uint8Array(zip);
assert.equal(z[0],0x50); assert.equal(z[1],0x4b); assert.equal(z[2],0x03); assert.equal(z[3],0x04);
console.log('Punkt 22 core tests: OK');
