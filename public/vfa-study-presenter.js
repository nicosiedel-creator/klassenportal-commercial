const slides=[
  {
    section:'Start',title:'Heute zählt: verstehen, anwenden, wiedererkennen.',
    body:`<div class="three"><div class="card"><h3>BGB / EjD</h3><p>Vertrag · Kauf · Mangel · Verzug</p></div><div class="card"><h3>AVR / StR / Beamtenrecht</h3><p>VA · Widerspruch · GG · Statusrecht</p></div><div class="card"><h3>AWL + Verwaltung</h3><p>Konjunktur · BIP · EZB · GGO · Kommunikation</p></div></div>`,
    source:'Tätigkeitsnachweise und bisherige VAK-/Klausuraufgaben.'
  },
  {
    section:'Start',title:'Nicht vorlesen. Gemeinsam lösen.',
    body:`<div class="flow"><span class="node">Frage sehen</span><span class="arrow">→</span><span class="node">30–60 Sek. diskutieren</span><span class="arrow">→</span><span class="node">Antwort nennen</span><span class="arrow">→</span><span class="node">Lösung aufdecken</span></div><div class="challenge"><h3>Regel für heute</h3><p>Wenn ihr euch bei einer Norm oder einem Rechenweg uneinig seid: erst begründen, dann aufdecken.</p></div>`,
    source:'Lernformat für die heutige Lerngruppe.'
  },
  {
    section:'BGB / EjD',title:'Ein Vertrag braucht zwei passende Erklärungen.',
    body:`<div class="flow"><span class="node">Angebot</span><span class="arrow">＋</span><span class="node">Annahme</span><span class="arrow">＝</span><span class="node">Vertrag</span></div><div class="two"><div class="card"><h3>Willenserklärung</h3><p>Auf einen rechtlichen Erfolg gerichtete Erklärung.</p></div><div class="card"><h3>Merksatz</h3><p>Nicht die Bezahlung macht den Vertrag – sondern Angebot und Annahme.</p></div></div>`,
    source:'EjD: Verträge, Willenserklärung; Tätigkeitsnachweis 16.–20.02.2026.'
  },
  {
    section:'BGB / EjD',title:'Rechtsfähigkeit ≠ Geschäftsfähigkeit',
    body:`<div class="two"><div class="card light"><h3>Rechtsfähigkeit</h3><p>Träger von Rechten und Pflichten sein.</p></div><div class="card light"><h3>Geschäftsfähigkeit</h3><p>Durch eigene Willenserklärungen wirksam Rechtsfolgen herbeiführen.</p></div></div><div class="challenge"><p>Vorherige Zustimmung = <span class="reveal"><b>Einwilligung, § 183 BGB</b></span><br>Nachträgliche Zustimmung = <span class="reveal"><b>Genehmigung, § 184 BGB</b></span></p></div>`,
    source:'EjD: Geschäftsfähigkeit und Zustimmung.'
  },
  {
    section:'BGB / EjD',title:'§ 433 BGB – zwei Seiten desselben Vertrags',
    body:`<div class="two"><div class="card ok"><h3>Verkäufer</h3><p>Übergabe + Eigentumsverschaffung + mangelfreie Sache</p></div><div class="card warn"><h3>Käufer</h3><p>Kaufpreis zahlen + Sache abnehmen</p></div></div><p class="muted">Prüfungsfalle: Die Mängelrechte beginnen nicht bei „Rücktritt“, sondern regelmäßig bei der Nacherfüllung.</p>`,
    source:'PR/BGB: Kauf §§ 433–477; Tätigkeitsnachweise April/Mai 2026.'
  },
  {
    section:'BGB / EjD',title:'Mangel gefunden – welche Tür geht zuerst auf?',
    body:`<div class="flow"><span class="node">§ 434<br>Sachmangel?</span><span class="arrow">→</span><span class="node">§ 437 Nr. 1</span><span class="arrow">→</span><span class="node">§ 439 Abs. 1<br>Nacherfüllung</span></div><div class="two"><div class="card"><h3>Variante 1</h3><p class="reveal">Mangel beseitigen = Nachbesserung</p></div><div class="card"><h3>Variante 2</h3><p class="reveal">Mangelfreie Sache liefern = Ersatzlieferung</p></div></div>`,
    source:'BGB §§ 434, 437 Nr. 1, 439 Abs. 1.'
  },
  {
    section:'BGB / EjD',title:'§ 477 BGB – warum der Zeitpunkt so wichtig ist',
    body:`<div class="flow"><span class="node">Übergabe<br>§ 446 S. 1</span><span class="arrow">→</span><span class="node">7 Tage später:<br>Defekt sichtbar</span><span class="arrow">→</span><span class="node reveal">Vermutung des § 477 BGB</span></div><div class="challenge"><h3>Frage</h3><p>Der Verkäufer sagt: „Du hast es selbst kaputtgemacht.“ Er kann das nicht beweisen. Welche Norm ist euer stärkster Anker?</p></div>`,
    source:'EjD: Verbrauchsgüterkauf, Beweislastumkehr; Tätigkeitsnachweis 16.–20.02.2026.'
  },
  {
    section:'BGB / EjD',title:'Liefertermin 05.11. – am 06.11. noch nichts da.',
    body:`<div class="challenge"><h3>Mahnung nötig?</h3><p>Der Termin war ausdrücklich kalendermäßig bestimmt.</p><p class="reveal"><b>Nein.</b> § 286 Abs. 2 Nr. 1 BGB: Mahnung grundsätzlich entbehrlich.</p></div><div class="flow"><span class="node">fälliger Anspruch</span><span class="arrow">→</span><span class="node">Nichtleistung</span><span class="arrow">→</span><span class="node">Mahnung / Ausnahme</span><span class="arrow">→</span><span class="node">Vertretenmüssen</span></div>`,
    source:'PR/BGB: Verzug §§ 286/288; Tätigkeitsnachweise Mai 2026.'
  },
  {
    section:'BGB / EjD',title:'BGB-Minifall: Welche Normkette bringt euch Punkte?',
    body:`<div class="challenge"><p>Verbraucher kauft eine Figur im Laden. Eine Woche später stellt sich heraus: Sie kann nicht wie üblich stehen. Verkäufer bestreitet einen ursprünglichen Mangel.</p></div><div class="formula reveal">§ 433 → § 474 → § 434 → § 437 Nr. 1 → § 439 Abs. 1 → § 477</div><p class="reveal">Erst Anspruch/Recht sauber aufbauen, dann kurz subsumieren.</p>`,
    source:'Kaufrechtsfälle und VAK-Muster; Unterrichtsschwerpunkt §§ 433–477 BGB.'
  },
  {
    section:'AVR',title:'Verwaltungsakt? Sechs Merkmale – kein Bauchgefühl.',
    body:`<div class="pillrow"><span class="pill">Behörde</span><span class="pill">hoheitliche Maßnahme</span><span class="pill">öffentliches Recht</span><span class="pill">Regelung</span><span class="pill">Einzelfall</span><span class="pill">Außenwirkung</span></div><div class="formula">§ 35 S. 1 VwVfG</div>`,
    source:'AVR: Verwaltungsakt; Tätigkeitsnachweis 18.–22.05.2026.'
  },
  {
    section:'AVR',title:'Rechtmäßigkeit: drei Ebenen, immer in derselben Reihenfolge.',
    body:`<div class="three"><div class="card"><div class="big-number">1</div><h3>Ermächtigungsgrundlage</h3></div><div class="card"><div class="big-number">2</div><h3>formell</h3><p>Zuständigkeit · Verfahren · Form</p></div><div class="card"><div class="big-number">3</div><h3>materiell</h3><p>Tatbestand · Rechtsfolge · Verhältnismäßigkeit</p></div></div>`,
    source:'AVR: Rechtmäßigkeitsprüfung Verwaltungsakt.'
  },
  {
    section:'AVR',title:'Bekanntgabe: Die Prüfungsfalle hat sich geändert.',
    body:`<div class="flow"><span class="node">Aufgabe zur Post</span><span class="arrow">→</span><span class="node">Tag 1</span><span class="arrow">→</span><span class="node">Tag 2</span><span class="arrow">→</span><span class="node">Tag 3</span><span class="arrow">→</span><span class="node reveal">Tag 4 = Fiktion</span></div><div class="formula reveal">§ 41 Abs. 2 S. 1 VwVfG: grundsätzlich 4 Tage</div>`,
    source:'Aktuelle Rechtslage § 41 Abs. 2 S. 1 VwVfG; Unterricht Bekanntgabe VA.'
  },
  {
    section:'AVR',title:'Fehlerhaft heißt nicht automatisch nichtig.',
    body:`<div class="two"><div class="card warn"><h3>rechtswidrig / fehlerhaft</h3><p>Kann trotzdem wirksam sein.</p><p class="reveal">Bestimmte Verfahrens-/Formfehler können nach § 45 VwVfG geheilt werden.</p></div><div class="card bad"><h3>nichtig</h3><p>Ausnahme mit besonders schwerem Fehler.</p><p class="reveal">Prüfungsanker: § 44 VwVfG.</p></div></div>`,
    source:'AVR: fehlerhafter VA, Heilung; Tätigkeitsnachweis 18.–22.05.2026.'
  },
  {
    section:'AVR',title:'Widerspruch – erst zulässig, dann begründet.',
    body:`<div class="flow"><span class="node">§ 40 I 1 VwGO</span><span class="arrow">→</span><span class="node">§ 68</span><span class="arrow">→</span><span class="node">§ 42 II analog</span><span class="arrow">→</span><span class="node">§ 70 I</span></div><div class="two"><div class="card"><h3>Zulässigkeit</h3><p>Rechtsweg · Statthaftigkeit · Befugnis · Form/Frist</p></div><div class="card"><h3>Begründetheit</h3><p>Rechtmäßigkeit + Rechtsverletzung; zusätzlich Zweckmäßigkeit</p></div></div>`,
    source:'AVR: Widerspruch und Verfahrensfolgen; Tätigkeitsnachweis 22.–26.06.2026.'
  },
  {
    section:'AVR',title:'AVR-Minifall: Verkehrszeichen vor dem Grundstück',
    body:`<div class="challenge"><p>Mobiles Halteverbot wegen Straßenarbeiten. Betroffener greift nur das Verbot direkt vor seinem Grundstück an. Auf der Gegenseite wäre ausreichend Platz.</p><p class="reveal"><b>Prüffokus:</b> konkrete Belastung, Ermächtigungsgrundlage, formelle Rechtmäßigkeit, Tatbestand/Ermessen und Verhältnismäßigkeit. Angriffspunkt exakt formulieren.</p></div>`,
    source:'Dozentenlösung Halteverbot / Widerspruch als Aufbaureferenz.'
  },
  {
    section:'StR / ÖR',title:'Gewaltenteilung – wer macht was?',
    body:`<div class="three"><div class="card"><h3>Legislative</h3><p>Gesetzgebung</p></div><div class="card"><h3>Exekutive</h3><p>Regierung + Verwaltung</p></div><div class="card"><h3>Judikative</h3><p>Rechtsprechung</p></div></div><p class="reveal" style="text-align:center;margin-top:30px"><b>Die Verwaltung gehört zur Exekutive.</b></p>`,
    source:'Staatsrecht / Grundlagen Verwaltung.'
  },
  {
    section:'StR / ÖR',title:'Art. 20 GG – fünf Begriffe, die ihr sicher zuordnen müsst.',
    body:`<div class="pillrow"><span class="pill">Republik</span><span class="pill">Demokratie</span><span class="pill">Sozialstaat</span><span class="pill">Bundesstaat</span><span class="pill">Rechtsstaatlichkeit</span></div><div class="challenge"><p>Art. 20 Abs. 3 GG bindet Gesetzgebung an die verfassungsmäßige Ordnung und vollziehende Gewalt sowie Rechtsprechung an Gesetz und Recht.</p></div>`,
    source:'StR/ÖR: Art. 20 GG, Staatsfundament; Tätigkeitsnachweis 18.–22.05.2026.'
  },
  {
    section:'StR / ÖR',title:'Wie entsteht ein Bundesgesetz?',
    body:`<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/GD-D6ii9Q50?rel=0" title="Deutscher Bundestag: Einfach erklärt – Die Gesetzgebung" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p class="muted" style="margin-top:12px">Direkt eingebettetes Erklärvideo des Deutschen Bundestages.</p>`,
    source:'Deutscher Bundestag: „Einfach erklärt: Die Gesetzgebung“.'
  },
  {
    section:'StR / ÖR',title:'Gesetzesinitiative: genau drei Wege.',
    body:`<div class="three"><div class="card"><h3>Bundesregierung</h3></div><div class="card"><h3>Bundesrat</h3></div><div class="card"><h3>aus der Mitte des Bundestages</h3></div></div><div class="formula">Art. 76 Abs. 1 GG</div>`,
    source:'Aktuelle WiSo-Prüfung 2026 / Art. 76 Abs. 1 GG.'
  },
  {
    section:'StR / ÖR',title:'Mehrheiten: 221 Ja · 179 Nein · 82 Enthaltungen',
    body:`<div class="challenge"><h3>Bundestag – beschlossen?</h3><p>482 nehmen teil. Abgegeben: 221 Ja, 179 Nein, 82 Enthaltungen.</p><p class="reveal"><b>Ja.</b> Mehrheit der abgegebenen Stimmen, Art. 42 Abs. 2 S. 1 GG; Enthaltungen entscheiden hier nicht gegen die einfache Mehrheit.</p></div><div class="challenge"><h3>Bundesrat: 35 Ja von 69 Stimmen?</h3><p class="reveal"><b>Ja.</b> Mindestens Mehrheit seiner Stimmen, Art. 52 Abs. 3 S. 1 GG: 35.</p></div>`,
    source:'Aktuelle WiSo-Prüfung 2026.'
  },
  {
    section:'StR / ÖR',title:'Art. 8 oder Art. 12? Schutzbereich zuerst.',
    body:`<div class="two"><div class="card"><h3>Art. 8 Abs. 1 GG</h3><p>Deutsche · Versammlung · friedlich · ohne Waffen</p></div><div class="card"><h3>Art. 12 Abs. 1 GG</h3><p>Deutsche · Berufswahl + Berufsausübung</p></div></div><p class="reveal" style="text-align:center;margin-top:30px">Immer: persönlicher Schutzbereich → sachlicher Schutzbereich → Eingriff → Schranke → Verhältnismäßigkeit.</p>`,
    source:'StR/ÖR: Grundrechte; Tätigkeitsnachweis 22.–26.06.2026.'
  },
  {
    section:'Beamtenrecht',title:'Beamter ist nicht Arbeitnehmer mit anderem Namen.',
    body:`<div class="formula">öffentlich-rechtliches Dienst- und Treueverhältnis</div><div class="pillrow" style="justify-content:center;margin-top:30px"><span class="pill">Widerruf</span><span class="pill">Probe</span><span class="pill">Lebenszeit</span><span class="pill">Zeit</span></div><p class="muted" style="text-align:center;margin-top:24px">§ 3 Abs. 1 BeamtStG als Statusanker.</p>`,
    source:'Beamtenrecht: Arten des Beamtenverhältnisses; Tätigkeitsnachweis 06.–10.04.2026.'
  },
  {
    section:'Beamtenrecht',title:'Ernennung: Entscheidend ist die Aushändigung.',
    body:`<div class="flow"><span class="node">Urkunde datiert 16.07.</span><span class="arrow">→</span><span class="node">Aushändigung 31.07.</span><span class="arrow">→</span><span class="node reveal">Wirksam ab 31.07.</span></div><div class="challenge"><p class="reveal">§ 8 Abs. 4 BeamtStG: Ernennung auf einen zurückliegenden Zeitpunkt ist unzulässig.</p></div>`,
    source:'Beamtenrecht: Wirksamkeit der Ernennung, BeamtStG § 8.'
  },
  {
    section:'Beamtenrecht',title:'Nebentätigkeit Berlin – nicht alles ist gleich.',
    body:`<div class="two"><div class="card warn"><h3>entgeltlich</h3><p class="reveal">Grundsätzlich vorher genehmigungspflichtig, § 62 LBG.</p></div><div class="card ok"><h3>künstlerisch</h3><p class="reveal">Grundsätzlich genehmigungsfrei, § 63 LBG; weitere Pflichten beachten.</p></div></div><div class="formula">Arbeitszeitfrage: § 64 LBG</div>`,
    source:'Beamtenrecht: Nebentätigkeiten; Tätigkeitsnachweis 06.–10.04.2026.'
  },
  {
    section:'Beamtenrecht',title:'Abordnung: vorübergehend – anderer Einsatz – derselbe Dienstherr',
    body:`<div class="challenge"><p>Berlin-interne Abordnung für mehrere Monate. Neuer Arbeitsweg deutlich länger, aber dienstliche Gründe liegen vor.</p><p class="reveal"><b>Prüfanker:</b> § 27 LBG. Dienstliche Gründe + vorübergehende Tätigkeit + Interessenabwägung + Beteiligungen.</p></div>`,
    source:'Beamtenrechtsfall Abordnung / Lösungshorizont.'
  },
  {
    section:'AWL',title:'Konjunktur ist eine Bewegung – keine Liste.',
    body:`<svg class="chart" viewBox="0 0 900 360" role="img" aria-label="Konjunkturkurve"><line class="axis" x1="60" y1="310" x2="860" y2="310"/><line class="axis" x1="60" y1="40" x2="60" y2="310"/><path class="curve" d="M70 270 C160 250 170 75 285 70 S430 265 505 275 S645 235 700 80 S805 70 850 240"/><text x="105" y="220">Expansion</text><text x="240" y="55">Boom</text><text x="365" y="205">Rezession</text><text x="475" y="302">Depression</text><text x="690" y="60">neuer Boom</text></svg>`,
    source:'AWL: Konjunktur; Tätigkeitsnachweis 22.–26.06.2026.'
  },
  {
    section:'AWL',title:'Indikatoren: Wann zeigen sie die Entwicklung?',
    body:`<div class="three"><div class="card"><h3>Früh</h3><p>Auftragseingänge</p></div><div class="card"><h3>Präsenz</h3><p>Kapazitätsauslastung</p></div><div class="card"><h3>Spät</h3><p>Arbeitslosigkeit</p></div></div><p class="reveal" style="text-align:center;margin-top:28px">Nicht auswendig als Wortpaar lernen – überlegen, ob die Kennzahl vorläuft, gleichzeitig reagiert oder nachläuft.</p>`,
    source:'AWL: Konjunkturindikatoren.'
  },
  {
    section:'AWL',title:'BIP und BNE: Ort gegen Personenkreis.',
    body:`<div class="two"><div class="card"><div class="big-number">BIP</div><h3>Inlandskonzept</h3><p>Wo wird die wirtschaftliche Leistung erzeugt?</p></div><div class="card"><div class="big-number">BNE</div><h3>Inländerkonzept</h3><p>Wessen Einkommen wird betrachtet?</p></div></div>`,
    source:'AWL: BIP, BNE; Tätigkeitsnachweis 22.–26.06.2026.'
  },
  {
    section:'AWL',title:'Rechenfall aus eurer Klausur: nominal 3.555,28 → 3.642,18',
    body:`<div class="formula">(3.642,18 − 3.555,28) ÷ 3.555,28 × 100 = <span class="reveal">2,44 %</span></div><div class="challenge"><p>Deflation: 0,5 %. In der vereinfachten Unterrichtsrechnung:</p><div class="formula reveal">2,44 % + 0,5 % = 2,94 % reales Wachstum</div></div><p class="muted">Für diese Unterrichts-/Klausuraufgabe wird die vereinfachte Methode verwendet.</p>`,
    source:'Aktuelle AWL-Klausur und Dozentenrückfrage zur Aufgabe 8.'
  },
  {
    section:'AWL',title:'Das magische Viereck: vier Ziele, die sich beeinflussen.',
    body:`<div class="two"><div class="card"><h3>Preisstabilität</h3></div><div class="card"><h3>hoher Beschäftigungsstand</h3></div><div class="card"><h3>außenwirtschaftliches Gleichgewicht</h3></div><div class="card"><h3>stetiges + angemessenes Wachstum</h3></div></div><p class="reveal" style="text-align:center;margin-top:26px">Wachstum ↔ Beschäftigung ist ein klassisches Beispiel für Zielharmonie.</p>`,
    source:'AWL: Magisches Viereck; Stabilitätsgesetz-Unterricht.'
  },
  {
    section:'AWL',title:'Inflation, Deflation, Preisstabilität – direkt erklärt',
    body:`<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/tesGVz6LbTY?rel=0" title="Deutsche Bundesbank: Preisstabilität, Inflation und Deflation" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><p class="muted" style="margin-top:12px">Direkt eingebetteter Animationsfilm der Deutschen Bundesbank.</p>`,
    source:'Deutsche Bundesbank: „Was ist Preisstabilität, Inflation und Deflation?“'
  },
  {
    section:'AWL',title:'Zinsen: Welche Kette setzt die EZB in Gang?',
    body:`<div class="flow"><span class="node">Leitzins ↑</span><span class="arrow">→</span><span class="node">Kredite tendenziell teurer</span><span class="arrow">→</span><span class="node">Konsum / Investitionen ↓</span><span class="arrow">→</span><span class="node">Preisdruck ↓</span></div><div class="flow reveal"><span class="node">Leitzins ↓</span><span class="arrow">→</span><span class="node">Kredite tendenziell günstiger</span><span class="arrow">→</span><span class="node">Nachfrage ↑</span></div>`,
    source:'AWL: EZB/Geldpolitik.'
  },
  {
    section:'AWL',title:'Drei Wirtschaftsordnungen – drei Steuerungslogiken.',
    body:`<div class="three"><div class="card"><h3>freie Marktwirtschaft</h3><p>Privateigentum · Wettbewerb · dezentrale Planung</p></div><div class="card"><h3>Zentralverwaltungswirtschaft</h3><p>Kollektiveigentum · zentrale Planung · staatliche Preise</p></div><div class="card"><h3>soziale Marktwirtschaft</h3><p>Marktmechanismus + sozialer und ordnender Rahmen</p></div></div>`,
    source:'AWL: Wirtschaftsordnung; aktuelle WiSo-Prüfung 2026.'
  },
  {
    section:'VT / Kommunikation',title:'Verwaltung: rechtmäßig handeln – verständlich erklären.',
    body:`<div class="two"><div class="card"><h3>VT / GGO</h3><p>Berlin: Hauptverwaltung + Bezirksverwaltungen</p><p>Vorrang des Gesetzes · Vorbehalt des Gesetzes · Vermerk · Verfügung · Dienstweg</p></div><div class="card"><h3>bbKomm</h3><p>Sender–Empfänger · Eisbergmodell · aktives Zuhören · Paraphrasieren · Ich-Botschaften</p></div></div><div class="flow"><span class="node">Bürger</span><span class="arrow">→</span><span class="node">verständlich + sachlich + hilfsbereit</span><span class="arrow">→</span><span class="node">Verwaltung</span></div>`,
    source:'Tätigkeitsnachweise 23.02.–10.04.2026.'
  },
  {
    section:'Finale',title:'Speed-Runde: 8 Antworten in 90 Sekunden',
    body:`<div class="two"><div class="card"><p>1. Definition VA?</p><p>2. Nacherfüllung?</p><p>3. Gesetzesinitiative?</p><p>4. Beamten-Ernennung?</p></div><div class="card"><p>5. Frühindikator?</p><p>6. BIP-Konzept?</p><p>7. Widerspruchsfrist?</p><p>8. Paraphrasieren?</p></div></div><div class="challenge reveal"><p>§ 35 S. 1 VwVfG · § 439 I · Art. 76 I GG · Aushändigung Urkunde · Auftragseingänge · Inlandskonzept · 1 Monat · mit eigenen Worten wiedergeben</p></div>`,
    source:'Wiederholung der Kernpunkte aus den Lernblöcken.'
  },
  {
    section:'Fertig',title:'Lernteil geschafft. Jetzt schreibt jeder selbst.',
    body:`<div class="two"><div class="card"><div class="big-number">60</div><h3>Minuten Einzeltest</h3><p>48 Fragen · individuell gemischt · ohne Namen</p></div><div class="card"><h3>Auf dem Beamer bleibt danach:</h3><p>QR-Code + Direktlink + verbundene Teilnehmer + anonyme Live-Auswertung.</p><button id="prepareQuiz" class="primary" type="button">QR-Quiz jetzt vorbereiten</button><p id="prepareMessage" class="muted" style="margin-top:12px"></p></div></div>`,
    source:'Übergang zur anonymen Live-Quizphase.'
  }
];

const deck=document.getElementById('deck');
const controls=document.getElementById('controls');
const lobby=document.getElementById('lobby');
const counter=document.getElementById('counter');
const progress=document.getElementById('progress');
const prev=document.getElementById('prev');
const next=document.getElementById('next');
const reveal=document.getElementById('reveal');
const fullscreen=document.getElementById('fullscreen');
let index=0;
let activeSession=null;
let pollTimer=null;

function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function slideHtml(s,i){return `<section class="slide ${i===0?'active':''}" data-index="${i}"><div class="slide-inner"><div class="eyebrow">${esc(s.section)}</div><h2>${s.title}</h2>${s.body}<p class="muted" style="margin-top:24px"><small>${esc(s.source)}</small></p></div></section>`;}
deck.innerHTML=slides.map(slideHtml).join('');

function update(){
  document.querySelectorAll('.slide').forEach((el,i)=>el.classList.toggle('active',i===index));
  counter.textContent=`${index+1} / ${slides.length}`;
  progress.style.width=`${((index+1)/slides.length)*100}%`;
  prev.disabled=index===0;
  next.disabled=index===slides.length-1;
  const current=document.querySelector(`.slide[data-index="${index}"]`);
  const hasReveal=!!current?.querySelector('.reveal:not(.shown)');
  reveal.disabled=!hasReveal;
  reveal.textContent=hasReveal?'Lösung einblenden':'Alles sichtbar';
  if(index===slides.length-1)bindPrepare();
}
function move(delta){index=Math.max(0,Math.min(slides.length-1,index+delta));update();}
function revealCurrent(){const current=document.querySelector(`.slide[data-index="${index}"]`);current?.querySelectorAll('.reveal').forEach(x=>x.classList.add('shown'));update();}
prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));reveal.addEventListener('click',revealCurrent);
fullscreen.addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
document.addEventListener('keydown',e=>{if(lobby.classList.contains('hidden')){if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();move(1);}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();move(-1);}if(e.key.toLowerCase()==='r'){e.preventDefault();revealCurrent();}if(e.key.toLowerCase()==='f'){e.preventDefault();fullscreen.click();}}});

function bindPrepare(){const btn=document.getElementById('prepareQuiz');if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.addEventListener('click',prepareQuiz);}}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});headers.set('content-type','application/json');
  if(activeSession?.token)headers.set('X-Live-Study-Presenter-Token',activeSession.token);
  const response=await fetch(path,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
  if(!response.ok||!data.ok)throw new Error(data.error||`HTTP_${response.status}`);return data;
}
async function prepareQuiz(){
  const message=document.getElementById('prepareMessage'),btn=document.getElementById('prepareQuiz');if(btn)btn.disabled=true;if(message)message.textContent='Quiz-Sitzung wird erstellt …';
  try{
    const created=await api('/api/live-study/sessions',{method:'POST',body:JSON.stringify({title:'VFA 13 – Lerngruppen-Quiz'})});
    activeSession={id:created.session.id,token:created.session.presenterToken,url:created.session.participantUrl};
    localStorage.setItem('vfa-live-study-presenter',JSON.stringify(activeSession));
    await api(`/api/live-study/sessions/${activeSession.id}/lobby`,{method:'POST',body:'{}'});
    showLobby();
  }catch(error){
    if(btn)btn.disabled=false;
    if(message)message.textContent=String(error.message)==='UNAUTHENTICATED'?'Bitte in diesem Browser zuerst als Plattform-Admin anmelden und dann erneut klicken.':`Fehler: ${String(error.message)}`;
  }
}
function showLobby(){
  deck.classList.add('hidden');controls.classList.add('hidden');lobby.classList.remove('hidden');
  document.getElementById('quizUrl').textContent=activeSession.url;
  const qr=document.getElementById('qr');qr.src=`https://quickchart.io/qr?size=500&margin=2&text=${encodeURIComponent(activeSession.url)}`;
  document.getElementById('startQuiz').onclick=startQuiz;document.getElementById('closeQuiz').onclick=closeQuiz;
  poll();clearInterval(pollTimer);pollTimer=setInterval(poll,2000);
}
async function startQuiz(){
  const btn=document.getElementById('startQuiz');btn.disabled=true;
  try{await api(`/api/live-study/sessions/${activeSession.id}/start`,{method:'POST',body:'{}'});await poll();}
  catch(e){btn.disabled=false;document.getElementById('lobbyMessage').textContent=`Start fehlgeschlagen: ${e.message}`;}
}
async function closeQuiz(){if(!confirm('Test wirklich für alle beenden?'))return;try{await api(`/api/live-study/sessions/${activeSession.id}/close`,{method:'POST',body:'{}'});await poll();}catch(e){document.getElementById('lobbyMessage').textContent=`Beenden fehlgeschlagen: ${e.message}`;}}
function remainingText(s){if(!s.quizStartedAt)return '–';const end=Date.parse(s.quizStartedAt)+Number(s.durationSeconds||3600)*1000,sec=Math.max(0,Math.ceil((end-Date.now())/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function renderStats(data){
  const s=data.session,st=data.stats;document.getElementById('joined').textContent=st.joined;document.getElementById('submitted').textContent=st.submitted;document.getElementById('average').textContent=st.submitted?`${st.averagePercent}%`:'–';document.getElementById('remaining').textContent=s.status==='quiz'?remainingText(s):(s.status==='closed'?'00:00':'–');
  const start=document.getElementById('startQuiz'),close=document.getElementById('closeQuiz');start.classList.toggle('hidden',s.status==='quiz'||s.status==='closed');close.classList.toggle('hidden',s.status!=='quiz');
  document.getElementById('liveTitle').textContent=s.status==='lobby'?'Warte auf Teilnehmer …':s.status==='quiz'?'Test läuft – Ergebnisse kommen live rein':s.status==='closed'?'Test beendet – Gruppenauswertung':'Lernphase';
  document.getElementById('topicStats').innerHTML=Object.entries(st.topics||{}).map(([topic,v])=>{const pct=v.total?Math.round(v.correct/v.total*100):0;return `<div class="topic-row"><b>${esc(topic)}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`;}).join('');
  const hardestWrap=document.getElementById('hardestWrap'),hardest=document.getElementById('hardest');if(st.hardest?.length){hardestWrap.classList.remove('hidden');hardest.innerHTML=st.hardest.map(x=>`<li><b>${esc(x.topic)}</b>: ${esc(x.question)} <span class="muted">(${x.wrong}× falsch)</span></li>`).join('');}else hardestWrap.classList.add('hidden');
  document.getElementById('lobbyMessage').textContent=s.status==='lobby'?`${st.joined} Gerät${st.joined===1?'':'e'} verbunden. Starte erst, wenn alle bereit sind.`:s.status==='quiz'?'Alle Teilnehmer haben denselben serverseitigen 60-Minuten-Zeitraum.':s.status==='closed'?'Die anonymisierte Auswertung bleibt auf diesem Bildschirm sichtbar.':'';
}
async function poll(){if(!activeSession)return;try{const data=await api(`/api/live-study/sessions/${activeSession.id}/presenter`);renderStats(data);}catch(e){if(['LIVE_STUDY_EXPIRED','LIVE_STUDY_NOT_FOUND'].includes(e.message)){clearInterval(pollTimer);localStorage.removeItem('vfa-live-study-presenter');}document.getElementById('lobbyMessage').textContent=`Live-Aktualisierung: ${e.message}`;}}

update();
