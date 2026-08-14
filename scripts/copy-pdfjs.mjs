import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const source = 'node_modules/pdfjs-dist';
const target = 'public/vendor/pdfjs';
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
copyFileSync(join(source, 'build', 'pdf.mjs'), join(target, 'pdf.mjs'));
copyFileSync(join(source, 'build', 'pdf.worker.mjs'), join(target, 'pdf.worker.mjs'));
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(source, dir), join(target, dir), { recursive: true });
}
console.log('PDF.js assets copied to public/vendor/pdfjs');
