import { strict as assert } from 'node:assert';
import { hashPassword, verifyPassword } from '../dist/core/auth.js';

const generated=await hashPassword('Runtime-Test-Passwort-2026!');
assert.match(generated,/^scrypt\$32768\$8\$3\$/,'new password hashes must use OWASP-aligned scrypt parameters');
assert.equal(await verifyPassword('Runtime-Test-Passwort-2026!',generated),true,'newly generated scrypt hash must verify');
assert.equal(await verifyPassword('falsch',generated),false,'wrong password must fail');
const unusableLegacy='pbkdf2$600000$nc3jfXBHbLMI/HBMfluSqw==$AWU/UMexWK1uvs2NvSY4o3KgOp2CDBa1V488daZdV1k=';
assert.equal(await verifyPassword('Nico1234!Wechseln',unusableLegacy),false,'Cloudflare-incompatible 600k PBKDF2 hashes must fail closed instead of throwing');
console.log('Password KDF runtime compatibility: OK');
