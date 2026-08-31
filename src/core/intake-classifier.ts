import type { IntakeExtracted } from './intake-document-extract.js';
import { importRole, rowValue, textRows } from './organization-import.js';

// Ein Mandant wirft einen ganzen Ordner ein. Darin liegt alles durcheinander: Vertraege einzelner
// Teilnehmer, Teilnehmerlisten, Kurslisten, Fachlisten, Dozentenlisten. Bisher wurde jeder Eingang
// ausschliesslich als Teilnehmerimport gelesen - eine Kursliste wurde damit zu unbrauchbaren
// Teilnehmerzeilen mit fehlender E-Mail, und der ganze Stapel landete in der Handpruefung.
//
// Diese Weiche entscheidet je Unterlage, wohin sie gehoert. Sie benutzt bewusst dieselbe
// Rollenerkennung wie der Organisationsimport selbst (importRole): zwei eigene Definitionen
// wuerden auseinanderlaufen, und dann faende die Weiche etwas anderes als der Importer.

export type IntakeRoute='organization'|'participants'|'none';
export type RouteDecision={source:string;route:IntakeRoute;reason:string;items:number};

// Ein Vertrag nennt sich selbst so. Diese Woerter stehen in Ausbildungs-, Schulungs- und
// Umschulungsvertraegen und in keiner Kurs- oder Dozentenliste.
const CONTRACT_SIGNAL=/\b(?:ausbildungsvertrag|schulungsvertrag|umschulungsvertrag|weiterbildungsvertrag|bildungsvertrag|teilnahmevertrag|vertragsnummer|bildungsgutschein|massnahmenummer|maßnahmenummer)\b/i;

// Eine einzige Regel, und sie stammt nicht von hier: importRole entscheidet ohnehin fuer jede
// Zeile, ob sie einen Kurs, ein Fach, eine Lehrkraft, einen Klassenadmin oder einen Teilnehmer
// beschreibt. Steht in einer Unterlage irgendetwas, das kein Teilnehmer ist, ist es eine
// Struktur- oder Rollenunterlage.
//
// Bewusst keine zweite Spaltenheuristik daneben: sie waere fuer fast jeden Fall unerreichbar,
// weil importRole ihn schon erkannt hat - und die wenigen Faelle, die sie zusaetzlich faengt,
// wuerde sie falsch einsortieren. Eine reine Teilnehmerliste mit einer Fachspalte ist eine
// Teilnehmerliste.
// Und die Gegenprobe zum Auffangfall: importRole gibt am Ende "participant" zurueck, wenn ihm
// nichts anderes einfaellt. Fuer einen ganzen Ordner ist das zu wenig. Gemessen am Abnahmepaket
// eines Kunden landeten so ueber siebenhundert Zeilen in der Teilnehmerpruefung, in denen keine
// einzige Person steht: Abwesenheiten, Pruefungstermine, Meldungen, Lernziele, Zertifikate,
// Umfragen, ein Jahresgrundplan. Jede davon wurde als Teilnehmer ohne Name und ohne E-Mail
// vorgelegt - hunderte Zeilen Handpruefung fuer nichts, und der Eindruck, der Import erkenne
// nichts.
//
// Eine Zeile ohne Person ist keine Person. Fuehrt eine Unterlage in keiner einzigen Zeile einen
// Namen, eine E-Mail oder ein Personenfeld, ist sie kein Teilnehmerimport - und sie wird als
// solche benannt, statt als kaputte Teilnehmerliste vorgelegt zu werden.
const PERSON_COLUMNS=['display_name','name','person','person_name','participant','participant_name','teilnehmer','teilnehmer_name','schueler','schuelerin','student','studentin','first_name','vorname','last_name','nachname','email','e_mail','mail','emailadresse','teacher','teacher_name','dozent','dozent_name','lehrkraft'];
export function rowHasPerson(row:Record<string,unknown>):boolean{return Boolean(rowValue(row,...PERSON_COLUMNS));}

export function routeRows(rows:Record<string,unknown>[]):{route:IntakeRoute;reason:string}{
  if(!rows.length)return{route:'participants',reason:'EMPTY'};
  if(rows.some(row=>importRole(row)!=='participant'))return{route:'organization',reason:'ROLE_OTHER_THAN_PARTICIPANT'};
  if(!rows.some(rowHasPerson))return{route:'none',reason:'NO_PERSON_IN_DOCUMENT'};
  return{route:'participants',reason:'PERSON_ROWS'};
}

export function routeText(text:string):{route:IntakeRoute;reason:string}{
  const value=String(text||'');
  if(!value.trim())return{route:'participants',reason:'EMPTY'};
  // Ein Vertrag bleibt ein Vertrag, auch wenn er eine Rollenzeile enthaelt.
  if(CONTRACT_SIGNAL.test(value))return{route:'participants',reason:'CONTRACT_SIGNAL'};
  // Sonst: enthaelt der Text beschriftete Bloecke, deren Rolle kein Teilnehmer ist, ist es eine
  // Struktur- oder Rollenunterlage - etwa eine Dozentenliste als PDF.
  const blocks=textRows(value);
  if(blocks.length&&blocks.some(block=>importRole(block as unknown as Record<string,unknown>)!=='participant'))
    return{route:'organization',reason:'ROLE_OTHER_THAN_PARTICIPANT'};
  return{route:'participants',reason:'DEFAULT_CONTRACT'};
}

export type RoutedIntake={
  participantRows:Record<string,unknown>[];
  participantTexts:string[];
  organizationRows:Record<string,unknown>[];
  organizationTexts:string[];
  decisions:RouteDecision[];
  unsupported:string[];
};

export function emptyRouted():RoutedIntake{return{participantRows:[],participantTexts:[],organizationRows:[],organizationTexts:[],decisions:[],unsupported:[]};}

// Nimmt das Ergebnis der Dateierkennung auf und legt es auf das richtige Gleis. Ein Archiv wird
// dabei Eintrag fuer Eintrag einsortiert - ein Ordner darf gemischt sein.
export function routeExtracted(into:RoutedIntake,source:string,extracted:IntakeExtracted):RoutedIntake{
  if(extracted.kind==='rows'){
    const decision=routeRows(extracted.rows);
    into.decisions.push({source,route:decision.route,reason:decision.reason,items:extracted.rows.length});
    if(decision.route==='none'){into.unsupported.push(source);return into;}
    (decision.route==='organization'?into.organizationRows:into.participantRows).push(...extracted.rows);
    return into;
  }
  if(extracted.kind==='texts'){
    for(const text of extracted.texts){
      const decision=routeText(text);
      into.decisions.push({source,route:decision.route,reason:decision.reason,items:1});
      (decision.route==='organization'?into.organizationTexts:into.participantTexts).push(text);
    }
    return into;
  }
  if(extracted.kind==='archive'){
    for(const entry of extracted.entries)routeExtracted(into,`${source}/${entry.name}`,entry.extracted);
    for(const name of extracted.skipped)into.unsupported.push(`${source}/${name}`);
    return into;
  }
  into.unsupported.push(source);
  return into;
}

// Ein Archiv kann Unterlagen enthalten, deren Text erst im Browser entsteht (PDF, Bild). Die
// koennen im Archiv nicht gelesen werden - sie werden benannt, damit der Eingang sie zur
// Pruefung stellt, statt sie zu verschweigen.
export function archiveNeedsClientText(extracted:IntakeExtracted):string[]{
  if(extracted.kind!=='archive')return[];
  return extracted.entries.filter(e=>e.extracted.kind==='client_pdf'||e.extracted.kind==='ocr_required').map(e=>e.name);
}
