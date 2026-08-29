import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';

// Ein technischer Fehlercode ist ein Entwicklertext. Er darf nie in einer Kundenoberfläche
// erscheinen - weder als eigener Fallback noch weil eine Anzeige e.message direkt ausgibt.

const dict=await readFile('public/kp-error-text.js','utf8');
const scope={window:{}};
new Function('window',dict)(scope.window);
const t=scope.window.KP_ERROR_TEXT;
assert.equal(typeof t,'function','das gemeinsame Wörterbuch muss window.KP_ERROR_TEXT bereitstellen');

// Codes, die im Alltag jeder Rolle auftreten können, brauchen einen echten Satz.
for(const code of ['UNAUTHENTICATED','LOGIN_RATE_LIMITED','FORBIDDEN','TENANT_ACCESS_SUSPENDED',
                   'COURSE_CODE_EXISTS','ONBOARDING_EXPIRED','ONBOARDING_ALREADY_COMPLETED',
                   'PAYMENT_DISABLED','MATERIAL_FILE_TYPE_INVALID','INTERNAL_ERROR']){
  const text=t(code);
  assert.notEqual(text,code,`${code} wird dem Kunden unübersetzt angezeigt`);
  assert.ok(/[a-zäöüß]/.test(text)&&text.length>15,`${code} braucht einen verständlichen Satz, nicht "${text}"`);
  assert.doesNotMatch(text,/[A-Z]{3,}_[A-Z]/,`${code} enthält noch einen technischen Code: "${text}"`);
}

// Ein unbekannter Code darf niemals durchgereicht werden.
for(const unknown of ['EIN_VOELLIG_NEUER_CODE','TWIN_SCOPE_INVALID_XYZ','ABC_DEF']){
  const text=t(unknown);
  assert.notEqual(text,unknown,`unbekannter Code ${unknown} erscheint roh in der Oberfläche`);
  assert.doesNotMatch(text,/^[A-Z][A-Z0-9_]*$/,'der Rückfall darf kein technischer Code sein');
}
// Freier Text (etwa ein Netzwerkfehler des Browsers) bleibt erhalten.
assert.equal(t('Laden fehlgeschlagen'),'Laden fehlgeschlagen','lesbare Meldungen dürfen nicht überschrieben werden');
assert.ok(t('').length>15,'ein leerer Fehler braucht trotzdem eine Aussage');

// Jede Kundenoberfläche muss das Wörterbuch laden, sonst greift der Rückfall dort nicht.
for(const shell of ['customer-admin.html','platform-admin.html','class-admin.html','dozentenportal.html',
                    'class-portal.html','onboarding.html','angebot.html','index.html','department-lead.html']){
  const html=await readFile(`public/${shell}`,'utf8');
  assert.match(html,/kp-error-text\.js/,`${shell} lädt das gemeinsame Fehlerwörterbuch nicht`);
}
// Und jede Shell, deren eigene Skripte auf das Wörterbuch zurückfallen, muss es auch laden -
// sonst ist window.KP_ERROR_TEXT dort undefiniert und der Rückfall liefert wieder den rohen Code.
// account-action.html tat genau das.
const missingDictionary=[];
for(const shell of (await readdir('public')).filter(f=>f.endsWith('.html'))){
  const html=await readFile(`public/${shell}`,'utf8');
  if(/kp-error-text\.js/.test(html))continue;
  const scripts=[...new Set((html.match(/\/[a-z0-9-]+\.js/g)||[]).map(x=>x.slice(1)))];
  for(const file of scripts){
    let source='';try{source=await readFile(`public/${file}`,'utf8');}catch{continue;}
    if(source.includes('KP_ERROR_TEXT')){missingDictionary.push(`${shell} braucht es für ${file}`);break;}
  }
}
assert.deepEqual(missingDictionary,[],`diese Shells nutzen das Wörterbuch, laden es aber nicht:\n${missingDictionary.join('\n')}`);

// Keine Oberfläche darf einen Fehler mehr unübersetzt ausgeben.
//
// Die frühere Fassung suchte feste Schreibweisen - .textContent=e.message und zwei Varianten.
// Damit blieben dreizehn Stellen unentdeckt, die dasselbe tun, nur anders geschrieben:
// `textContent=err.message` (anderer Bezeichner) und `textContent=\`Fehler: ${e.message}\``
// (Einsetzung in eine Zeichenkette). Diese Regel prüft stattdessen jede Zuweisung an
// textContent/innerText/innerHTML: taucht darin ein .message auf, das weder durch das
// Wörterbuch noch durch einen eigenen Aufruf oder eine Nachschlagetabelle geht, ist es roh.
// esc() zählt dabei nicht als Übersetzung - es schützt vor Markup, nicht vor Fachchinesisch.
const ASSIGNMENT=/(?:textContent|innerText|innerHTML)\s*=\s*((?:[^;]|\n){0,200}?);/g;
const MESSAGE=/\b([A-Za-z_$][\w$]*)\??\.message\b/g;
// esc() und E() schützen vor Markup, sie übersetzen nicht - ein Aufruf davon macht aus einem
// technischen Code keinen deutschen Satz. Der Name direkt vor der Klammer wird deshalb
// festgehalten und geprüft, statt ihn in einer Verneinung zu suchen: eine Verneinung ohne
// Anker lässt sich umgehen, weil das Muster auch mitten im Namen greifen kann.
const CALL_BEFORE=/([A-Za-z_$][\w$]*)\(\s*$/;
const NOT_TRANSLATING=new Set(['esc','E','String','esc2']);
// Eine Nachschlagetabelle kann auch unmittelbar aufgeschrieben sein: ({...})[x.message]. Es
// zählt die Klammer, nicht der Name davor.
const TABLE_LOOKUP=/[)\]}A-Za-z_$][\w$]*\[\s*$|\)\[\s*$|\}\[\s*$/;

// Das VFA13-Portal ist in diesem Auftrag ausdrücklich unberührt zu lassen. Seine beiden
// Präsentationsskripte zeigen ihre Fehler noch roh an; das ist dort zu beheben, nicht hier.
const OUT_OF_SCOPE=new Set(['vfa-study-presenter.js','vfa-study-resume.js']);

const raw=[];
for(const file of (await readdir('public')).filter(f=>f.endsWith('.js'))){
  if(OUT_OF_SCOPE.has(file))continue;
  const src=await readFile(`public/${file}`,'utf8');
  for(const assignment of src.matchAll(ASSIGNMENT)){
    const expression=assignment[1];
    if(expression.includes('KP_ERROR_TEXT'))continue;
    for(const found of expression.matchAll(MESSAGE)){
      const before=expression.slice(0,found.index);
      const call=CALL_BEFORE.exec(before);
      if(call&&!NOT_TRANSLATING.has(call[1]))continue;
      if(TABLE_LOOKUP.test(before))continue;
      raw.push(`${file}: ${assignment[0].replace(/\s+/g,' ').slice(0,110)}`);
      break;
    }
  }
  // Eine Übersetzungstabelle, die auf ihren eigenen Schlüssel zurückfällt, zeigt genau den
  // technischen Code an, den sie übersetzen sollte.
  for(const m of src.matchAll(/\)\[code\]\s*\|\|\s*code\b/g))raw.push(`${file}: ${m[0]}`);
}
assert.deepEqual(raw,[],`diese Stellen zeigen einen Fehlercode unübersetzt an:\n${raw.join('\n')}`);

console.log('Fehlertext-Vertrag: gemeinsames Wörterbuch, sicherer Rückfall und keine rohen Codes in der Oberfläche: OK');
