// Der Adressraum dieses Portals - an einer Stelle, nicht verteilt ueber Routenzweige, eine
// Asset-Konfiguration und zwei Referer-Pruefungen.
//
// Gemessen am laufenden Worker (wrangler dev, lokal, ohne Release-Sperre), Stand vor dieser
// Datei:
//
//   /kunden-admin        200  Kundenverwaltung
//   /KUNDEN-admin        200  Startseite (index.html)   <- falsche Seite, richtiger Status
//   /PLATTFORM-ADMIN     200  Startseite (index.html)
//   /portal-admin        200  Startseite (index.html)
//   /gibtsnicht          200  Startseite (index.html)
//
// Ursache war nicht der Worker, sondern die Asset-Zustellung: not_found_handling war auf
// "single-page-application" gestellt. Jede Adresse, fuer die es keine Datei gibt, bekam damit
// index.html mit Status 200 - und den Worker sah sie nie. Deshalb lief auch die Weiterleitung
// von /portal-admin nach /plattform-admin, die im Worker steht und im Test gruen war, in
// Produktion nie: der Asset-Dienst hatte laengst geantwortet.
//
// Daraus folgen drei Regeln, die diese Datei durchsetzt:
//
//   1. Jede Oberflaeche hat genau eine Adresse. Jede andere Schreibweise fuehrt dauerhaft
//      dorthin (308) - Gross-/Kleinschreibung, Schrägstrich am Ende, .html-Endung, alter Name.
//   2. Welche Oberflaeche eine Adresse meint, steht hier - nicht in einem Zeichenkettenvergleich
//      an der Stelle, die es gerade braucht.
//   3. Was hier nicht steht und keine Datei ist, gibt es nicht. Es antwortet mit 404, nicht mit
//      einer fremden Seite.
//
// Die VFA13-Seiten stehen bewusst nicht in dieser Tabelle. Ihre Routen bleiben unveraendert im
// Worker; hier wird an ihnen nichts geaendert.

export type PageSurface='start'|'plattform'|'kunden'|'klassen'|'oeffentlich';

export interface PageAddress{
  /** Die kanonische Adresse. Alles andere fuehrt hierher. */
  readonly path:string;
  /** Welche Oberflaeche diese Adresse meint. */
  readonly surface:PageSurface;
  /** Die auszuliefernde Seite, wenn der Worker sie selbst holt. null: sie entsteht anderswo. */
  readonly asset:string|null;
  /** Fruehere oder interne Schreibweisen derselben Adresse. */
  readonly aliases?:readonly string[];
}

export const PAGE_ADDRESSES:readonly PageAddress[]=[
  // Die Startseite ist der Einstieg: Anmeldung, danach die eigene Oberflaeche. Sie wird nicht
  // hier ausgeliefert, sondern wie bisher vom Asset-Dienst - die Zeile sagt nur, dass es diese
  // Adresse gibt und was sie meint.
  {path:'/',surface:'start',asset:null,aliases:['/index']},

  // Die drei Verwaltungsoberflaechen. Die Dateinamen sind englisch, die Adressen deutsch; die
  // englischen Namen waren bisher zweite oeffentliche Adressen derselben Seite und fuehren
  // jetzt auf die eine.
  {path:'/plattform-admin',surface:'plattform',asset:'/platform-admin.html',aliases:['/platform-admin','/portal-admin','/portaladmin']},
  {path:'/kunden-admin',surface:'kunden',asset:'/customer-admin.html',aliases:['/customer-admin']},
  {path:'/klassen-admin',surface:'klassen',asset:'/class-admin.html',aliases:['/class-admin']},

  {path:'/dozentenportal',surface:'klassen',asset:'/dozentenportal.html'},
  {path:'/department-lead',surface:'klassen',asset:null},

  {path:'/produkt',surface:'oeffentlich',asset:'/produkt.html'},
  {path:'/partner',surface:'oeffentlich',asset:null},
  {path:'/testcenter',surface:'oeffentlich',asset:null},
  {path:'/certificate-verify',surface:'oeffentlich',asset:null},

  {path:'/passwort-vergessen',surface:'oeffentlich',asset:'/account-action.html'},
  {path:'/passwort-zuruecksetzen',surface:'oeffentlich',asset:'/account-action.html'},
  {path:'/konto-aktivieren',surface:'oeffentlich',asset:'/account-action.html'},

  {path:'/zahlung/erfolg',surface:'oeffentlich',asset:'/payment-result.html'},
  {path:'/zahlung/abgebrochen',surface:'oeffentlich',asset:'/payment-result.html'},

  {path:'/impressum',surface:'oeffentlich',asset:null},
  {path:'/datenschutz',surface:'oeffentlich',asset:null},
  {path:'/agb',surface:'oeffentlich',asset:null},
  {path:'/avv',surface:'oeffentlich',asset:null},
  {path:'/unterauftragsverarbeiter',surface:'oeffentlich',asset:null},
  {path:'/datenportabilitaet',surface:'oeffentlich',asset:null},
  {path:'/rechtsverstoss-melden',surface:'oeffentlich',asset:null},
] as const;

// Nur Adressen mit fester Schreibweise stehen in der Tabelle. Adressen mit beweglichen Teilen -
// /portal/<traeger>/<kurs>, /einrichtung/<token>, /angebot/<token>, /quiz/vfa13/<id> - bleiben
// beim Worker und werden hier nicht angefasst: dort ist Gross-/Kleinschreibung Inhalt, kein
// Schreibfehler.
export function canonicalPagePath(pathname:string):string{
  const lower=pathname.toLowerCase().replace(/\/{2,}/g,'/');
  const withoutHtml=lower.length>5&&lower.endsWith('.html')?lower.slice(0,-5):lower;
  const trimmed=withoutHtml.replace(/\/+$/,'');
  return trimmed||'/';
}

const ADDRESS_INDEX:ReadonlyMap<string,PageAddress>=(()=>{
  const index=new Map<string,PageAddress>();
  for(const address of PAGE_ADDRESSES){index.set(address.path,address);for(const alias of address.aliases??[])index.set(alias,address);}
  return index;
})();

export type PageAddressMatch={kind:'serve';address:PageAddress}|{kind:'redirect';address:PageAddress;location:string};

export function matchPageAddress(pathname:string):PageAddressMatch|null{
  const address=ADDRESS_INDEX.get(canonicalPagePath(pathname));
  if(!address)return null;
  return pathname===address.path?{kind:'serve',address}:{kind:'redirect',address,location:address.path};
}

export function pageSurface(pathname:string):PageSurface|null{return ADDRESS_INDEX.get(canonicalPagePath(pathname))?.surface??null;}

// Die Nur-Lesen-Sperre der Plattform-Supportansicht haengt daran, von welcher Oberflaeche eine
// Anfrage kommt. Sie hing bisher an der genauen Schreibweise der Adresse im Referer: auf
// /kunden-admin griff sie, auf /KUNDEN-admin nicht - dieselbe Seite, aber schreibend. Sie fragt
// jetzt dieselbe Tabelle wie die Auslieferung.
export function refererSurface(referer:string|null|undefined):PageSurface|null{
  if(!referer)return null;
  try{return pageSurface(new URL(referer).pathname);}catch{return null;}
}
