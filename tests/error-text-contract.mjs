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
                    'class-portal.html','onboarding.html','angebot.html','index.html']){
  const html=await readFile(`public/${shell}`,'utf8');
  assert.match(html,/kp-error-text\.js/,`${shell} lädt das gemeinsame Fehlerwörterbuch nicht`);
}

// Keine Oberfläche darf einen Fehler mehr unübersetzt ausgeben.
const raw=[];
for(const file of (await readdir('public')).filter(f=>f.endsWith('.js'))){
  const src=await readFile(`public/${file}`,'utf8');
  for(const rx of [/\.textContent=[exc]\.message\b/g,/\bE\([exc]\.message\)/g,/\)\[[exc]\.message\]\|\|[exc]\.message/g,
                   // Eine Übersetzungstabelle, die auf ihren eigenen Schlüssel zurückfällt, zeigt
                   // genau den technischen Code an, den sie übersetzen sollte. Sieben Oberflächen
                   // taten das, weil sie eine Tabelle statt e.message benutzen.
                   /\)\[code\]\s*\|\|\s*code\b/g])
    for(const m of src.matchAll(rx))raw.push(`${file}: ${m[0]}`);
}
assert.deepEqual(raw,[],`diese Stellen zeigen einen Fehlercode unübersetzt an:\n${raw.join('\n')}`);

console.log('Fehlertext-Vertrag: gemeinsames Wörterbuch, sicherer Rückfall und keine rohen Codes in der Oberfläche: OK');
