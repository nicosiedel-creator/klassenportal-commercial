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

// Codes, die eine Oberfläche dem Nutzer wirklich zeigt und die er selbst auflösen kann. Sie
// fielen alle auf denselben Allgemeinplatz zurueck ("Die Aktion konnte nicht ausgefuehrt
// werden"), obwohl der Worker genau benennt, was fehlt: eine Umfrage ist geschlossen, ein Modul
// ist nicht gebucht, ein Teilnahmelink ist abgelaufen. Ein Satz, der nicht sagt, was zu tun ist,
// ist fuer den Nutzer so wenig wert wie der rohe Code.
const GENERIC=t('EIN_CODE_DEN_ES_NICHT_GIBT');
for(const code of ['OFFER_NOT_FOUND','OFFER_ALREADY_ACCEPTED','OFFER_NOT_CANCELLABLE',
                   'OFFER_LINK_NOT_AVAILABLE','OFFER_ONBOARDING_ALREADY_COMPLETED',
                   'MAIL_PROVIDER_NOT_CONFIGURED','SELLER_PROFILE_INCOMPLETE',
                   'LEGAL_CONFIGURATION_INCOMPLETE','PRICING_NOT_CONFIGURED',
                   'MODULE_ALREADY_ACTIVE','MODULE_NOT_ACTIVE','MODULE_PAYMENT_PENDING',
                   'MODULE_SELF_SERVICE_DISABLED','SELF_SERVICE_DOWNGRADE_NOT_ALLOWED',
                   'SURVEY_CLOSED','SURVEY_ALREADY_VOTED','LIVE_STUDY_CAPACITY_REACHED',
                   'PARTICIPANT_TOKEN_INVALID','PRESENTER_TOKEN_INVALID',
                   'TIMETABLE_FILE_UNSUPPORTED','TIMETABLE_BATCH_CONFIRMATION_REQUIRED',
                   'FORBIDDEN_COURSE_SCOPE','SELF_ELEVATION_FORBIDDEN','STRONG_AUTH_REQUIRED',
                   'PLATFORM_ADMIN_RESET_FORBIDDEN','PRIMARY_RESPONSIBILITY_TENANT_ADMIN_REQUIRED',
                   'TENANT_NOT_FOUND','USER_NOT_FOUND','PARTICIPANT_NOT_FOUND','TEACHER_NOT_FOUND',
                   'LESSON_NOT_FOUND','EXAM_NOT_FOUND','ORG_UNIT_NOT_FOUND','PLAN_NOT_FOUND',
                   'ATTENDANCE_SESSION_NOT_FOUND','RESOURCE_NOT_FOUND',
                   'DATE_INVALID','ENUM_VALUE_INVALID','USER_FIELDS_REQUIRED','PARTICIPANT_REQUIRED',
                   'TENANT_REQUIRED','DOMAIN_INVALID','LEGAL_REPORT_RATE_LIMITED','API_RATE_LIMITED']){
  const text=t(code);
  assert.notEqual(text,GENERIC,`${code} sagt dem Nutzer nur den Allgemeinplatz, obwohl der Worker die Ursache kennt`);
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

// Ein Fehler ohne Meldung ist kein Text. Geprüft wurde bisher nur der leere String - ein
// Error ohne Meldung fiel dagegen auf das Objekt selbst zurück und zeigte dem Kunden "Error",
// ein beliebiges Objekt sogar "[object Object]".
for(const value of [new Error(''),new Error(),{},[],0,null,undefined,new Error('   ')]){
  const text=t(value);
  assert.ok(text.length>15,`${String(value)} braucht einen Satz, nicht "${text}"`);
  assert.doesNotMatch(text,/^Error$|object Object/,`${String(value)} zeigt einen Entwicklertext: "${text}"`);
}
// Eine echte Meldung im Error bleibt selbstverständlich erhalten.
assert.equal(t(new Error('Laden fehlgeschlagen')),'Laden fehlgeschlagen');

// Dieselbe Regel gilt für die öffentliche Eingangsseite, die das Wörterbuch nicht laden kann.
const intake=await readFile('public/intake-public-upload.js','utf8');
const upload=new Function(intake.slice(0,intake.indexOf('\n}',intake.indexOf('function uploadFehler'))+2)+'\nreturn uploadFehler;')();
for(const value of [new Error(''),{},null,'GANZ_NEUER_CODE']){
  const text=upload(value);
  assert.ok(text.length>15,`Eingangsseite: ${String(value)} braucht einen Satz, nicht "${text}"`);
  assert.doesNotMatch(text,/^Error$|object Object|^[A-Z][A-Z0-9_]*$/,`Eingangsseite zeigt einen Entwicklertext: "${text}"`);
}
assert.equal(upload(new Error('Netzwerk unterbrochen')),'Netzwerk unterbrochen','lesbare Meldungen bleiben auch dort erhalten');

// Die Einrichtungsseite ist die erste Seite, die ein neuer Kunde ueberhaupt bedient - und die
// einzige, auf der er nichts anderes tun kann, wenn sie scheitert. Sie kannte fuenf Codes nicht,
// die der Server tatsaechlich wirft (ONBOARDING_ALREADY_COMPLETED, _NOT_OPEN, _RECOVERY_REQUIRED,
// _SCHEMA_INCOMPATIBLE, _FINALIZATION_FAILED). Alle fuenf landeten beim Kunden als "Bitte pruefe
// die Angaben" - obwohl an den Angaben nichts falsch war. Deshalb wird hier nicht eine Liste
// gepflegt, sondern verglichen: jeder Code, den der Einrichtungspfad werfen kann, muss auf der
// Einrichtungsseite einen eigenen Satz bekommen.
const onboardingSource=await readFile('public/onboarding.js','utf8');
const onboardingBody=onboardingSource.slice(onboardingSource.indexOf('function errorText(code)'),onboardingSource.indexOf('function renderForm'));
const setupText=new Function('window',`${onboardingBody}\nreturn errorText;`)({KP_ERROR_TEXT:t});
const setupGeneric=setupText('EIN_CODE_DEN_ES_NICHT_GIBT');
const serverCodes=new Set();
// Zwei Dateien zu lesen reichte nicht: ONBOARDING_PROVISIONING_FAILED steht nicht als
// throw new Error(...) da, sondern als Rueckfall in stageError - und genau dieser Code traf einen
// echten Kunden. Gesucht wird deshalb nach beidem, in allen Onboarding-Dateien.
for(const file of ['onboarding.ts','onboarding-schema.ts','onboarding-recovery.ts'])
  await readFile(`src/core/${file}`,'utf8').then(source=>{
    for(const match of source.matchAll(/throw new Error\('([A-Z][A-Z0-9_]{4,})'\)/g))serverCodes.add(match[1]);
    for(const match of source.matchAll(/stageError\([^,]+,'([A-Z][A-Z0-9_]{4,})'/g))serverCodes.add(match[1]);
  }).catch(()=>undefined);
assert.ok(serverCodes.size>=10,`zu wenige Einrichtungs-Fehlercodes gefunden: ${serverCodes.size}`);
const unexplained=[...serverCodes].filter(code=>setupText(code)===setupGeneric).sort();
assert.deepEqual(unexplained,[],
  `diese Fehler der Einrichtung sagen dem Kunden nur "Bitte pruefe die Angaben": ${unexplained.join(', ')}`);

// Der Kunde bekommt bei einem Stufenfehler zu Recht nur einen Sammelcode - SQL und Stacktraces
// haben in einer Kundenmeldung nichts verloren. Genau deshalb muss die echte Ursache aber im
// Betrieb ankommen: eine Kundeneinrichtung scheiterte in Produktion mit
// ONBOARDING_PROVISIONING_FAILED, und weil nichts protokolliert und nichts gespeichert wurde, war
// nicht herauszufinden, warum. Der wichtigste Pfad des Portals darf nicht spurlos scheitern.
const onboardingServer=await readFile('src/core/onboarding.ts','utf8');
const stageErrorFn=(onboardingServer.match(/function stageError\([\s\S]*?\n\}/)||[''])[0];
assert.ok(stageErrorFn,'die Stufenfehler-Behandlung muss auffindbar bleiben');
assert.match(stageErrorFn,/console\.error\(/,'ein maskierter Stufenfehler muss die echte Ursache protokollieren');
assert.match(stageErrorFn,/stage/,'das Protokoll muss benennen, welche Stufe scheiterte');
assert.match(stageErrorFn,/cause:/,'das Protokoll muss die tatsaechliche Meldung enthalten');
assert.doesNotMatch(stageErrorFn,/token|raw|password/i,'der Einrichtungs-Token und Passwörter duerfen nie ins Protokoll');
// Und der Kunde bekommt weiterhin nur den Sammelcode, nicht die Ursache.
assert.match(stageErrorFn,/return new Error\(fallback\);/,'die Ursache darf die Kundenmeldung nicht erreichen');

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
