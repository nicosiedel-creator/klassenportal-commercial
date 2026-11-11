import { strict as assert } from 'node:assert';
import { aiGatewayConfigured, callRoleModel } from '../dist/core/ai-gateway.js';
import { AI_ROLE_AGENTS, isAiRole, listAiRoleAgents, runAiRole } from '../dist/core/ai-agents.js';

// --- Konfigurationszustand (fail-closed) ---
assert.equal(aiGatewayConfigured({}), false, 'ohne Schluessel muss das Gateway inaktiv sein');
assert.equal(aiGatewayConfigured({ OPENROUTER_API_KEY: '   ' }), false, 'Leerzeichen zaehlen nicht als Schluessel');
assert.equal(aiGatewayConfigured({ OPENROUTER_API_KEY: 'sk-test' }), true, 'mit Schluessel ist das Gateway konfiguriert');
assert.equal(aiGatewayConfigured({ OPENROUTER_API_KEY: 'sk-test', AI_GATEWAY_ENABLED: 'false' }), false, 'explizites Abschalten gewinnt');

const realFetch = globalThis.fetch;

// --- Ohne Schluessel bzw. abgeschaltet: kein externer Aufruf ---
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('fetch must not be called'); };
try {
  const notConfigured = await callRoleModel({}, { role: 'lerncoach', system: 's', user: 'u' });
  assert.deepEqual(notConfigured, { ok: false, code: 'AI_NOT_CONFIGURED' });
  const disabled = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test', AI_GATEWAY_ENABLED: 'false' }, { role: 'lerncoach', system: 's', user: 'u' });
  assert.deepEqual(disabled, { ok: false, code: 'AI_DISABLED' });
  assert.equal(fetchCalls, 0, 'ohne aktives Gateway darf fetch nie aufgerufen werden');
} finally {
  globalThis.fetch = realFetch;
}

// --- Mit Schluessel: die Antwort wird uebernommen ---
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions');
  const parsed = JSON.parse(String(init.body));
  assert.equal(parsed.messages[0].role, 'system');
  assert.match(parsed.messages[0].content, /lerncoach/);
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Antwort' } }] }), { status: 200 });
};
try {
  const ok = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test' }, { role: 'lerncoach', system: 's', user: 'u' });
  assert.deepEqual(ok, { ok: true, text: 'Antwort', model: 'openai/gpt-4o-mini' });
} finally {
  globalThis.fetch = realFetch;
}

// --- Modellwahl: Rollenmodell greift, OPENROUTER_MODEL (Operator) hat Vorrang ---
let sentModel = '';
globalThis.fetch = async (url, init) => {
  sentModel = JSON.parse(String(init.body)).model;
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Antwort' } }] }), { status: 200 });
};
try {
  const roleModel = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test' }, { role: 'lerncoach', system: 's', user: 'u', model: 'google/gemini-3.1-flash-lite' });
  assert.equal(roleModel.model, 'google/gemini-3.1-flash-lite');
  assert.equal(sentModel, 'google/gemini-3.1-flash-lite');
  const override = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test', OPENROUTER_MODEL: 'meta/llama-3.2-3b' }, { role: 'lerncoach', system: 's', user: 'u', model: 'google/gemini-3.1-flash-lite' });
  assert.equal(override.model, 'meta/llama-3.2-3b', 'OPENROUTER_MODEL muss das Rollenmodell ueberschreiben');
  assert.equal(sentModel, 'meta/llama-3.2-3b');
} finally {
  globalThis.fetch = realFetch;
}

// --- Fehlerantwort und leere Antwort bleiben fail-closed ---
globalThis.fetch = async () => new Response('nope', { status: 500 });
try {
  const bad = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test' }, { role: 'lerncoach', system: 's', user: 'u' });
  assert.deepEqual(bad, { ok: false, code: 'AI_UPSTREAM_ERROR' });
} finally {
  globalThis.fetch = realFetch;
}
globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 });
try {
  const empty = await callRoleModel({ OPENROUTER_API_KEY: 'sk-test' }, { role: 'lerncoach', system: 's', user: 'u' });
  assert.deepEqual(empty, { ok: false, code: 'AI_EMPTY_RESPONSE' });
} finally {
  globalThis.fetch = realFetch;
}

// --- Rollenkatalog ---
assert.equal(isAiRole('lerncoach'), true);
assert.equal(isAiRole('unbekannt'), false);
assert.equal(isAiRole(null), false);
assert.equal(listAiRoleAgents().length, 6, 'es muessen sechs Rollen definiert sein');
for (const role of ['lerncoach', 'lehrkraft', 'verwaltung', 'qm', 'compliance', 'red_team']) {
  assert.ok(AI_ROLE_AGENTS[role], `Rolle ${role} fehlt`);
  assert.ok(AI_ROLE_AGENTS[role].system.length > 20, `Rolle ${role} braucht eine Leitlinie`);
  assert.ok(String(AI_ROLE_AGENTS[role].model).includes('/'), `Rolle ${role} braucht ein Katalogmodell`);
}

// --- runAiRole ist ohne Schluessel ebenfalls fail-closed ---
const roleOff = await runAiRole({}, 'lerncoach', 'Erklaere Brueche');
assert.deepEqual(roleOff, { ok: false, code: 'AI_NOT_CONFIGURED' });

console.log('ai-gateway: fail-closed Verhalten, Rollenkatalog und Upstream-Fehler geprueft: OK');
