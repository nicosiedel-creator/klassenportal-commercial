import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { etagMatches, normalizeEtag, sha256Text } from '../dist/portability/backup-integrity.js';

assert.equal(await sha256Text('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','SHA-256 helper must be deterministic');
assert.equal(normalizeEtag('W/"abc123"'),'abc123','weak/quoted etags must normalize safely');
assert.equal(etagMatches('"abc123"','abc123'),true,'equivalent R2 etags must compare equal');
assert.equal(etagMatches('abc123','different'),false,'different R2 etags must fail');

const backup=await readFile('src/portability/backup.ts','utf8');
assert.match(backup,/integrity:\{version:1,json:'sha256',files:'r2-etag-size'\}/,'new backups must declare strong integrity metadata');
assert.match(backup,/sha256:await sha256Text\(usersJson\)/,'user snapshot must be hashed');
assert.match(backup,/sha256:await sha256Text\(json\)/,'every JSON resource snapshot must be hashed');
assert.match(backup,/etag:copy\.etag/,'backed-up files must persist their R2 etag');
assert.match(backup,/R2_BACKUP_COPY_SIZE_MISMATCH/,'file copy must be size-verified immediately');

const preflight=await readFile('src/portability/backup-preflight.ts','utf8');
for(const marker of ['BACKUP_USERS_HASH_MISMATCH','BACKUP_RESOURCE_HASH_MISMATCH','BACKUP_FILE_SIZE_MISMATCH','BACKUP_FILE_ETAG_MISMATCH'])assert.ok(preflight.includes(marker),`restore preflight missing ${marker}`);
assert.match(preflight,/manifest\.integrity&&!item\.sha256/,'strong resource backups must not silently downgrade when a hash is missing');
assert.match(preflight,/manifest\.integrity&&!file\.etag/,'strong file backups must not silently downgrade when an etag is missing');

const verification=await readFile('src/core/backup-verification.ts','utf8');
assert.match(verification,/integrity_level TEXT NOT NULL DEFAULT 'structural'/,'verification schema must record integrity level');
assert.match(verification,/ALTER TABLE backup_verifications ADD COLUMN integrity_level/,'existing databases must self-heal the new integrity column');
for(const marker of ['BACKUP_USERS_ROWCOUNT_MISMATCH','BACKUP_RESOURCE_ROWCOUNT_MISMATCH','BACKUP_FILE_SIZE_MISMATCH','BACKUP_FILE_ETAG_MISMATCH','BACKUP_RESOURCE_HASH_MISMATCH'])assert.ok(verification.includes(marker),`scheduled verification missing ${marker}`);
assert.match(verification,/row\.integrity_level!=='strong'/,'launch readiness must reject legacy structural-only verification');
assert.match(verification,/row\.checked_at<row\.completed_at/,'readiness must reject stale verification results');

const readiness=await readFile('src/core/launch-readiness.ts','utf8');
assert.match(readiness,/backupReadiness\(env,48\)/,'production readiness must execute the strong backup readiness check');
assert.match(readiness,/Backup-Sicherheit nicht erfüllt/,'backup integrity failures must block live release');

const manifestTypes=await readFile('src/portability/types.ts','utf8');
assert.match(manifestTypes,/integrity\?: \{ version:1; json:'sha256'; files:'r2-etag-size' \}/,'manifest must expose versioned integrity metadata');
assert.match(manifestTypes,/sha256\?: string/,'manifest JSON snapshots must support hashes');
assert.match(manifestTypes,/etag\?: string/,'manifest files must support etags');

console.log('Backup SHA-256, row-count, size, etag and strong-readiness integrity checks: OK');
