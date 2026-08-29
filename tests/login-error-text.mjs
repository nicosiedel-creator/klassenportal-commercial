import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Die Anmeldemaske sagte bei einem falschen Passwort woertlich:
//   "Die Sitzung ist abgelaufen. Bitte erneut anmelden."
// Auf der ersten Seite des Produkts, zu jemandem, der sich gerade erst anmelden will. Eine
// Sperre nach fuenf Fehlversuchen wurde zu "Bitte Eingaben pruefen".
//
// Ursache: zwei Woerterbuecher. Das gemeinsame (kp-error-text.js) kannte beide Faelle laengst,
// das eigene in app.js nicht - und dessen Rueckfall deutet jede 401 als abgelaufene Sitzung.
//
// Dieser Test liest nicht, er fuehrt aus: die echte friendly()-Funktion und das echte
// gemeinsame Woerterbuch aus den ausgelieferten Dateien.

const app=await readFile('public/app.js','utf8');
const dictSource=await readFile('public/kp-error-text.js','utf8');

const sharedWindow={};
new Function('window',dictSource)(sharedWindow);
assert.ok(sharedWindow.KP_ERROR_TEXTS,'das gemeinsame Woerterbuch muss auf window liegen');

const table=(app.match(/const FRIENDLY=\{[\s\S]*?\};/)||[])[0];
const source=(app.match(/function friendly\(code,status=0\)\{[\s\S]*?\n\}/)||[])[0];
assert.ok(table&&source,'friendly() und seine Tabelle muessen auffindbar bleiben');
const friendly=new Function('window',`${table}\n${source}\nreturn friendly;`)(sharedWindow);

const SESSION_SENTENCE=friendly('UNAUTHENTICATED',401);
assert.match(SESSION_SENTENCE,/Sitzung/,'die Sitzungsmeldung muss weiterhin von der Sitzung sprechen');

// Der eigentliche Befund: eine abgewiesene Anmeldung ist keine abgelaufene Sitzung.
const wrongPassword=friendly('LOGIN_FAILED',401);
assert.notEqual(wrongPassword,SESSION_SENTENCE,
  'ein falsches Passwort darf nicht als abgelaufene Sitzung gemeldet werden');
assert.match(wrongPassword,/Passwort/i,'die Meldung muss das Passwort benennen');

const lockedOut=friendly('LOGIN_RATE_LIMITED',429);
assert.match(lockedOut,/Fehlversuche|warte|Minuten/i,
  'eine Sperre nach zu vielen Fehlversuchen muss als solche benannt werden');
assert.doesNotMatch(lockedOut,/Eingaben pr/i,
  'wer gesperrt ist, soll nicht seine Eingaben pruefen - die waren nicht das Problem');

// Jeder Code, den der Anmeldeweg im Worker werfen kann, muss einen eigenen Satz bekommen und darf
// nicht auf den Sitzungs- oder Allgemeinplatz zurueckfallen.
const auth=await readFile('src/core/auth.ts','utf8');
// Genau die Codes, die eine Anmeldung dem Browser zurueckgeben kann: die Rueckgaben von login()
// selbst und die Sperre, die es vorher prueft. Interne Fehler wie ein ungueltiger
// Schluesselableitungs-Parameter gehoeren ausdruecklich NICHT dazu - die duerfen dem Kunden
// keine Innereien nennen und bekommen deshalb zu Recht einen allgemeinen Satz.
const bodyOf=(name,next)=>auth.slice(auth.indexOf(name),auth.indexOf(next));
const loginBody=bodyOf('export async function login(','export async function logout(');
const rateBody=bodyOf('async function checkLoginRate(','async function recordLoginFailure(');
const codes=new Set([
  ...[...loginBody.matchAll(/error:'([A-Z][A-Z0-9_]{2,60})'/g)].map(m=>m[1]),
  ...[...rateBody.matchAll(/throw new Error\('([A-Z][A-Z0-9_]{2,60})'\)/g)].map(m=>m[1]),
]);
assert.ok(codes.has('LOGIN_FAILED')&&codes.has('LOGIN_RATE_LIMITED'),
  `die Codes des Anmeldewegs muessen auffindbar bleiben, gefunden: ${[...codes].join(', ')}`);
const GENERIC=friendly('UNBEKANNTER_CODE_OHNE_TEXT',400);
for(const code of codes){
  const text=friendly(code,code==='LOGIN_RATE_LIMITED'?429:code.includes('ORIGIN')?403:401);
  assert.notEqual(text,SESSION_SENTENCE,`${code} darf nicht als abgelaufene Sitzung gemeldet werden`);
  assert.notEqual(text,GENERIC,`${code} braucht einen eigenen Satz statt eines Allgemeinplatzes`);
  assert.doesNotMatch(text,/^[A-Z][A-Z0-9_]+$/,`${code} darf nie als technischer Code erscheinen`);
}

// Und die Ursache selbst: app.js muss das gemeinsame Woerterbuch fragen, bevor der Rueckfall
// ueber den Statuscode greift. Sonst faellt der naechste neue Code wieder auf denselben Satz.
const sharedAt=source.indexOf('KP_ERROR_TEXTS'),statusAt=source.indexOf('status===401');
assert.ok(sharedAt>=0,'app.js muss das gemeinsame Woerterbuch kennen');
assert.ok(sharedAt<statusAt,'das gemeinsame Woerterbuch muss vor dem Statusrueckfall gefragt werden');

console.log(`Anmeldefehler: ${codes.size} Codes des Anmeldewegs bekommen einen eigenen Satz; ein falsches Passwort ist keine abgelaufene Sitzung mehr: OK`);
