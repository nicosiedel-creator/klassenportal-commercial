import { strict as assert } from 'node:assert';
import { hashPassword, verifyPassword } from '../dist/core/auth.js';

const known='pbkdf2$600000$nc3jfXBHbLMI/HBMfluSqw==$AWU/UMexWK1uvs2NvSY4o3KgOp2CDBa1V488daZdV1k=';
assert.equal(await verifyPassword('Nico1234!Wechseln',known),true,'600k PBKDF2 hash must verify in the deployed crypto implementation');
assert.equal(await verifyPassword('falsch',known),false,'wrong password must fail');
const generated=await hashPassword('Runtime-Test-Passwort-2026!');
assert.match(generated,/^pbkdf2\$600000\$/,'new password hashes must remain at 600k PBKDF2-SHA256 iterations');
assert.equal(await verifyPassword('Runtime-Test-Passwort-2026!',generated),true,'newly generated hash must verify');
console.log('Password KDF runtime compatibility: OK');
