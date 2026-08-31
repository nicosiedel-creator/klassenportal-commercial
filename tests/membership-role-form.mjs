import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Befund aus dem Livebetrieb: "Der Kundenadmin kann leider nicht mal die Rollen ändern."
//
// In einem frisch eingerichteten Mandanten gibt es genau einen Benutzer - die Kundenadministration
// selbst - und noch keine Klasse. Damit scheiterte im Dialog "Benutzer & Rollen verwalten" jede
// denkbare Eingabe, und zwar erst nach dem Absenden:
//
//   - die eigene Zeile bearbeiten   -> CANNOT_REMOVE_OWN_TENANT_ADMIN
//   - jede Rolle ausser Kunden-Admin -> COURSE_ID_REQUIRED, weil die Klassenauswahl auf
//     "Organisation" stand und keine Klasse existierte
//
// Beide Regeln sind richtig. Falsch war, sie erst hinterher zu nennen.
//
// Dieser Test liest den Dialog nicht, er baut ihn: die echten Funktionen aus der ausgelieferten
// operational-crud-ui.js, gegen eine kleine Nachbildung des Dokuments. Gefragt wird, was ein
// Mensch vor sich haette - welche Felder gesperrt sind, was vorausgewaehlt ist, ob sich der
// Dialog absenden laesst und was als Hinweis dasteht.

const ui = await readFile('public/operational-crud-ui.js', 'utf8');
const dict = await readFile('public/kp-error-text.js', 'utf8');

// ---------------------------------------------------------------------------
// Eine bewusst kleine Nachbildung: nur so viel Dokument, wie der Dialog braucht.
// ---------------------------------------------------------------------------
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
function makeNode(tag, attrs) {
  const node = {
    tagName: tag.toUpperCase(), attrs, children: [], text: '', parent: null,
    handlers: {}, onsubmit: null, _disabled: 'disabled' in attrs, _value: attrs.value,
    get disabled() { return this._disabled; },
    set disabled(v) { this._disabled = !!v; },
    get value() {
      if (this.tagName !== 'SELECT') return this._value ?? '';
      const options = this.children.filter(c => c.tagName === 'OPTION');
      const selected = options.find(o => o._selected) || options[0];
      return selected ? (selected.attrs.value ?? '') : '';
    },
    set value(v) {
      if (this.tagName !== 'SELECT') { this._value = v; return; }
      for (const o of this.children.filter(c => c.tagName === 'OPTION')) o._selected = (o.attrs.value ?? '') === v;
    },
    get textContent() { return this.text + this.children.map(c => c.textContent).join(''); },
    set textContent(v) { this.children = []; this.text = String(v); },
    addEventListener(type, handler) { (this.handlers[type] || (this.handlers[type] = [])).push(handler); },
    remove() {},
    fire(type) { for (const handler of this.handlers[type] || []) handler({ target: this }); },
    all() { return this.children.flatMap(c => [c, ...c.all()]); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const steps = sel.trim().split(/\s+/);
      let pool = this.all();
      for (const step of steps) pool = pool.filter(n => matches(n, step)).flatMap(n => steps[steps.length - 1] === step ? [n] : n.all());
      return [...new Set(pool)];
    },
  };
  node._selected = 'selected' in attrs;
  node.dataset = {};
  for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) node.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return node;
}
function matches(node, step) {
  const attr = [...step.matchAll(/\[([a-z0-9-]+)(?:="([^"]*)")?\]/gi)];
  const cls = [...step.matchAll(/\.([a-z0-9_-]+)/gi)].map(m => m[1]);
  const tag = (step.match(/^([a-z0-9-]+)/i) || [])[1];
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  for (const c of cls) if (!String(node.attrs.class || '').split(/\s+/).includes(c)) return false;
  for (const [, name, value] of attr) {
    if (!(name in node.attrs)) return false;
    if (value !== undefined && node.attrs[name] !== value) return false;
  }
  return true;
}
function parseHtml(html) {
  const root = makeNode('div', {});
  const stack = [root];
  const tagRe = /<(\/?)([a-z0-9-]+)((?:\s+[^<>]*?)?)(\/?)>/gi;
  let last = 0, m;
  while ((m = tagRe.exec(html))) {
    const text = html.slice(last, m.index);
    if (text.trim()) stack[stack.length - 1].text += text;
    last = tagRe.lastIndex;
    const [, closing, tag, rawAttrs, selfClose] = m;
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const node = makeNode(tag, attrs);
    node.parent = stack[stack.length - 1];
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag.toLowerCase()) && !selfClose) stack.push(node);
  }
  const rest = html.slice(last);
  if (rest.trim()) stack[stack.length - 1].text += rest;
  return root;
}

// Die echten Bausteine des Dialogs aus der ausgelieferten Datei.
const slice = (head, foot) => {
  const from = ui.indexOf(head);
  assert.notEqual(from, -1, `"${head}" muss in operational-crud-ui.js auffindbar bleiben`);
  const to = ui.indexOf(foot, from);
  assert.notEqual(to, -1, `das Ende von "${head}" muss auffindbar bleiben`);
  return ui.slice(from, to);
};
const SOURCE = [
  slice('const opEsc=', '\nconst opTenant='),
  slice('function opForm(', '\nasync function opCourses('),
  slice('async function opCourses(', '\nfunction opOptions('),
  slice('function opOptions(', '\nfunction opDateTime('),
  slice('async function openMembershipManager(){', '\nconst opActions='),
].join('\n');

async function openDialog({ users, courses, me }) {
  const modals = [];
  const opModal = (title, html) => {
    const back = parseHtml(html);
    back.title = title;
    back.remove = () => {};
    modals.push(back);
    return back;
  };
  const requested = [];
  const opApi = async (url) => {
    requested.push(url);
    if (url.startsWith('/api/tenant/users')) return { users };
    if (url.startsWith('/api/courses')) return { courses };
    if (url === '/api/auth/me') return { user: me };
    return {};
  };
  const built = new Function(
    'opModal', 'opApi', 'opTenant', 'window', 'location', 'setTimeout',
    `${SOURCE}\nreturn openMembershipManager;`,
  )(opModal, opApi, () => 'ten_1', { KP_ERROR_TEXT: null }, { reload() {} }, () => {});
  await built();
  return { modals, requested, liste: modals[0] };
}

const ADMIN = { id: 'usr_admin', membership_id: 'mem_admin', display_name: 'Nico Siedel', email: 'admin@example.invalid', role: 'tenant_admin', course_id: null };
const TEILNEHMER = { id: 'usr_tn', membership_id: 'mem_tn', display_name: 'Anna Beispiel', email: 'anna@example.invalid', role: 'participant', course_id: 'crs_a' };
const KURSE = [{ id: 'crs_a', name: 'Verwaltungsfachangestellte 2026' }, { id: 'crs_b', name: 'Pflegehelfer Abendkurs' }];

const felder = (form) => ({
  rolle: form.querySelector('[name="role"]'),
  klasse: form.querySelector('[data-member-course]'),
  hinweis: form.querySelector('[data-member-hint]'),
  senden: form.querySelector('.op-form button.btn'),
});
const bearbeiten = async (state, membershipId) => {
  const dialog = await openDialog(state);
  const knopf = dialog.liste.querySelectorAll('.op-member-edit').find(b => b.attrs['data-id'] === membershipId);
  assert.ok(knopf, `die Zeile ${membershipId} muss einen Bearbeiten-Knopf haben`);
  knopf.onclick();
  const form = dialog.modals[dialog.modals.length - 1];
  assert.notEqual(form, dialog.liste, 'der Bearbeiten-Dialog muss sich oeffnen');
  return { dialog, form, ...felder(form) };
};

// 1. Der gemeldete Fall: frischer Mandant, ein einziger Benutzer, keine Klasse.
{
  const { form, rolle, klasse, hinweis } = await bearbeiten({ users: [ADMIN], courses: [], me: ADMIN }, 'mem_admin');
  assert.match(form.textContent, /Das ist dein eigenes Konto/, 'der Grund muss im Dialog stehen, nicht erst in einer Fehlermeldung');
  assert.match(form.textContent, /Es gibt noch keine Klasse/, 'auch die fehlende Klasse muss vorher dastehen');
  assert.equal(rolle.disabled, true, 'das eigene Kunden-Admin-Recht darf sich nicht abwaehlen lassen');
  assert.equal(klasse.disabled, true, 'fuer einen Kunden-Admin ist die Klassenauswahl gegenstandslos');
  assert.match(hinweis.textContent, /ganze Organisation/, 'der Hinweis muss den Geltungsbereich benennen');
}

// 2. Eine fremde Zeile mit vorhandenen Klassen: die Rolle laesst sich aendern, und die Klasse
//    wird vorausgewaehlt statt auf "Organisation" stehen zu bleiben.
{
  const { rolle, klasse, hinweis, senden } = await bearbeiten({ users: [ADMIN, TEILNEHMER], courses: KURSE, me: ADMIN }, 'mem_tn');
  assert.equal(rolle.disabled, false, 'eine fremde Zeile muss sich bearbeiten lassen');
  assert.equal(rolle.value, 'participant', 'die bestehende Rolle muss vorausgewaehlt sein');
  assert.equal(klasse.value, 'crs_a', 'die bestehende Klasse muss vorausgewaehlt sein');
  assert.equal(senden.disabled, false, 'so muss sich der Dialog absenden lassen');

  rolle.value = 'class_admin'; rolle.fire('change');
  assert.equal(klasse.disabled, false, 'Klassenverantwortliche brauchen eine Klasse');
  assert.ok(klasse.value, 'und die muss gesetzt bleiben');
  assert.equal(senden.disabled, false, 'mit gesetzter Klasse ist das Absenden moeglich');

  rolle.value = 'tenant_admin'; rolle.fire('change');
  assert.equal(klasse.value, '', 'ein Kunden-Admin gilt fuer die ganze Organisation');
  assert.equal(klasse.disabled, true, 'die Klassenauswahl ist dann gesperrt');
  assert.match(hinweis.textContent, /ganze Organisation/, 'und der Hinweis sagt genau das');
}

// 2b. Eine Zuordnung ohne Klasse, obwohl es Klassen gibt: die Auswahl darf nicht auf
//     "Ganze Organisation" stehen bleiben, sonst laeuft der Mensch in COURSE_ID_REQUIRED.
{
  const OHNE = { ...TEILNEHMER, membership_id: 'mem_ohne', course_id: null };
  const { klasse, senden, hinweis } = await bearbeiten({ users: [ADMIN, OHNE], courses: KURSE, me: ADMIN }, 'mem_ohne');
  assert.equal(klasse.value, 'crs_a', 'gibt es Klassen, muss eine vorausgewaehlt werden statt "Ganze Organisation"');
  assert.equal(senden.disabled, false, 'damit ist das Absenden moeglich');
  assert.match(hinweis.textContent, /gewählte Klasse/, 'und der Hinweis sagt, worauf sich die Rolle bezieht');
}

// 3. Der eigentliche Auslöser: eine Rolle, die eine Klasse braucht, ohne dass es eine gibt.
//    Vorher liess sich das absenden und scheiterte am Server mit COURSE_ID_REQUIRED.
{
  const { rolle, klasse, hinweis, senden } = await bearbeiten({ users: [ADMIN, TEILNEHMER], courses: [], me: ADMIN }, 'mem_tn');
  assert.equal(rolle.value, 'participant', 'die bestehende Rolle bleibt vorausgewaehlt');
  assert.equal(klasse.value, '', 'es gibt keine Klasse, also kann keine gewaehlt sein');
  assert.equal(senden.disabled, true, 'ohne Klasse darf sich der Dialog nicht absenden lassen');
  assert.match(hinweis.textContent, /Klasse benötigt/, 'und der Hinweis muss sagen, woran es liegt');
}

// 4. Ohne das eigene Konto waere die eigene Zeile nicht erkennbar - und der Dialog muesste raten.
{
  const dialog = await openDialog({ users: [ADMIN], courses: [], me: ADMIN });
  assert.ok(dialog.requested.includes('/api/auth/me'), 'der Dialog muss wissen, wer ihn geoeffnet hat');
}

// 5. Und wenn der Server doch ablehnt, muss der Satz verstaendlich sein.
const window = { KP_ERROR_TEXT: null };
new Function('window', dict)(window);
const TEXTS = window.KP_ERROR_TEXTS;
assert.ok(TEXTS, 'das gemeinsame Woerterbuch muss auf window liegen');
for (const code of ['CANNOT_REMOVE_OWN_TENANT_ADMIN', 'COURSE_ID_REQUIRED', 'FORBIDDEN_ROLE_ASSIGNMENT', 'CLASS_ADMIN_PARTICIPANT_MANAGED', 'ROLE_INVALID']) {
  const text = TEXTS[code];
  assert.ok(text, `${code} braucht einen verstaendlichen deutschen Satz`);
  assert.doesNotMatch(text, /^[A-Z][A-Z0-9_]+$/, `${code} darf nie als technischer Code erscheinen`);
}
// Ein zweiter Eintrag desselben Codes wuerde den ersten stillschweigend ueberschreiben - das ist
// beim Aufraeumen genau einmal passiert.
for (const code of ['CANNOT_REMOVE_OWN_TENANT_ADMIN', 'COURSE_ID_REQUIRED'])
  assert.equal((dict.match(new RegExp(`\\b${code}:'`, 'g')) || []).length, 1, `${code} darf nur einmal im Woerterbuch stehen`);
assert.match(TEXTS.CANNOT_REMOVE_OWN_TENANT_ADMIN, /zweite Person|zweiten/, 'der Satz muss den Ausweg nennen, nicht nur das Verbot');

console.log('Der Rollendialog nennt seine Grenzen vorher statt nach dem Absenden: OK');
