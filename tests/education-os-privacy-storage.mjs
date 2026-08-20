import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const privacy=await readFile('migrations/0078_minimize_sickness_detail.sql','utf8');
const storage=await readFile('migrations/0079_education_os_storage_guardrails.sql','utf8');
const security=await readFile('EDUCATION_OS_SECURITY.md','utf8');

assert.match(privacy,/trg_teacher_sickness_reason_minimize_insert/,'sickness minimisation insert trigger missing');
assert.match(privacy,/trg_teacher_sickness_reason_minimize_update/,'sickness minimisation update trigger missing');
assert.match(privacy,/source='sickness'/,'medical data minimisation must be tied to sickness records');
assert.match(privacy,/Krankheitsbedingte Abwesenheit/,'sickness reason must be reduced to a neutral operational label');

for(const trigger of ['trg_twin_snapshot_rate_guard','trg_scenario_rate_guard','trg_proof_package_rate_guard','trg_twin_snapshot_size_guard','trg_scenario_input_size_guard','trg_scenario_option_size_guard','trg_twin_event_size_guard','trg_proof_package_size_guard'])assert.match(storage,new RegExp(trigger),`${trigger} missing`);
assert.match(storage,/EDUCATION_OS_SNAPSHOT_RATE_LIMIT/,'snapshot rate-limit must fail closed');
assert.match(storage,/EDUCATION_OS_SCENARIO_RATE_LIMIT/,'scenario rate-limit must fail closed');
assert.match(storage,/EDUCATION_OS_PROOF_RATE_LIMIT/,'proof-package rate-limit must fail closed');
assert.match(storage,/EDUCATION_OS_TWIN_TOO_LARGE/,'Twin payload must be bounded');
assert.match(storage,/EDUCATION_OS_SCENARIO_PLAN_TOO_LARGE/,'scenario action plan must be bounded');
assert.match(storage,/EDUCATION_OS_EVENT_TOO_LARGE/,'Twin event payload must be bounded');

assert.match(security,/kein privilegierter Chatbot/i,'security model must reject privileged-chatbot architecture');
assert.match(security,/fail-closed/i,'security model must be fail-closed');
assert.match(security,/keine privaten Teilnehmernotizen/i,'security model must exclude private participant notes');
assert.match(security,/keine individuellen Anwesenheitsdatensätze/i,'security model must exclude individual attendance from the Twin');
assert.match(security,/Plattformadmin.*kein Ersatz-Kundenadmin/i,'platform admin must not bypass customer-autopilot control');
assert.match(security,/QES/i,'external signature trust boundary must be documented');

console.log('Education OS privacy/storage guard regression ok');
