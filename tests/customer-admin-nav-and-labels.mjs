import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

// Der Autopilot-Einstieg suchte seine Schaltflaeche nur innerhalb der Hauptnavigation. Sobald
// die Navigationsordnung sie nach "Weitere Bereiche" einsortiert hatte, fand er dort nichts
// mehr und legte eine zweite an: zwei Elemente mit derselben Kennung, und der Autopilot stand
// zweimal im Menue. Im Browser gemessen waren es 2x #kp-autopilot-primary, sobald der Autopilot
// einmal geoeffnet war.
const autopilot=await readFile('public/customer-autopilot-entry.js','utf8');
assert.match(autopilot,/document\.getElementById\('kp-autopilot-primary'\)/,'die Suche nach der Schaltflaeche muss das ganze Dokument abdecken, nicht nur die Hauptnavigation');
assert.doesNotMatch(autopilot,/nav\.querySelector\('#kp-autopilot-primary'\)/,'eine auf die Hauptnavigation begrenzte Suche laesst eine zweite Schaltflaeche entstehen');
assert.match(autopilot,/dataset\.customerNavPrimary='1'/,'die Schaltflaeche muss sich als Hauptnavigationspunkt ausweisen');

// Damit die Navigationsordnung sie auch dort belaesst.
const nav=await readFile('public/customer-admin-ui.js','utf8');
assert.match(nav,/button\.dataset\.customerNavPrimary==='1'\|\|PRIMARY_NAV_LABELS\.has\(label\)/,'die Navigationsordnung muss den ausgewiesenen Hauptnavigationspunkt in der Hauptnavigation lassen');

// Jedes sichtbare Bedienelement braucht einen Namen. Ein Platzhalter ist keiner: er verschwindet
// beim Tippen und wird nicht zuverlaessig angesagt. Ein Element gilt als beschriftet, wenn es in
// einem noch offenen <label> steht oder selbst einen Namen traegt.
const CONTROL=/<(textarea|select|input)\b[^>]*>/g;
const SELF_NAMED=/aria-label=|aria-labelledby=|id=/;
const NOT_A_FIELD=/type="(hidden|submit|button|reset)"/;
function unlabelled(source){
  const hits=[];
  for(const match of source.matchAll(CONTROL)){
    const tag=match[0];
    if(SELF_NAMED.test(tag)||NOT_A_FIELD.test(tag))continue;
    const before=source.slice(0,match.index);
    const open=(before.match(/<label\b/g)||[]).length-(before.match(/<\/label>/g)||[]).length;
    if(open<=0)hits.push(tag.slice(0,90));
  }
  return hits;
}
for(const file of await readdir('public')){
  if(!file.endsWith('.js'))continue;
  const source=await readFile(`public/${file}`,'utf8');
  const hits=unlabelled(source);
  assert.deepEqual(hits,[],`public/${file} baut Bedienelemente ohne Beschriftung: ${hits.join(' | ')}`);
}

console.log('Customer admin navigation identity and labelled form controls: OK');
