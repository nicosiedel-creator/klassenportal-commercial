import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const acceptance=await readFile('src/core/platform-offer-acceptance.ts','utf8');
const router=await readFile('src/core/platform-offer-router.ts','utf8');

const insert=acceptance.indexOf('INSERT INTO onboarding_invitations');
const update=acceptance.indexOf("UPDATE commercial_quotes SET status='accepted'");
assert.ok(insert>=0,'acceptance handler must insert onboarding invitation');
assert.ok(update>=0,'acceptance handler must mark quote accepted');
assert.ok(insert<update,'D1 foreign-key target onboarding_invitations must be inserted before commercial_quotes.onboarding_invitation_id is updated');
assert.match(router,/from '\.\/platform-offer-acceptance\.js'/,'public offer router must use the FK-safe acceptance handler');
assert.doesNotMatch(router,/acceptPublicOffer.*from '\.\/platform-offers\.js'/,'router must not regress to the FK-unsafe legacy acceptance implementation');

console.log('Platform offer D1 foreign-key ordering regression: OK');
