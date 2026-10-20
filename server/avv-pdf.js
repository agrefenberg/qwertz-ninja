// Vorlage für den Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) zwischen einer Schule und dem Betreiber,
// mit den Angaben aus dem Programm vorausgefüllt. Ersetzt keine Rechtsberatung.
import PDFDocument from 'pdfkit';

const GREY = '#555555';
const MARGIN = 60;

const fmtDate = (ms) => new Date(ms).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const yearEndText = (mmdd) => {
  const [m, d] = (mmdd || '07-31').split('-').map(Number);
  return `${d}.${m}.`;
};

export function avvSections({ school, operator, vidis, https }) {
  const blank = '____________________';
  const op = {
    name: operator.name || blank,
    address: operator.address || blank,
    contact: operator.contact || blank,
    dpo: operator.dpo || '',
    location: operator.location || 'auf eigener Hardware des Auftragsverarbeiters in Deutschland',
    subprocessors: operator.subprocessors || 'Keine. Der Betrieb erfolgt auf eigener Hardware des Auftragsverarbeiters.',
  };
  const yearEnd = yearEndText(school.year_end);

  const parties = [
    ['Verantwortlicher', [school.name, school.address || blank, `vertreten durch die Schulleitung: ${school.head || blank}`, school.school_code ? `Schulnummer / Schulkennung: ${school.school_code}` : null]],
    ['Auftragsverarbeiter', [op.name, op.address, `Kontakt: ${op.contact}`, op.dpo ? `Datenschutzkontakt: ${op.dpo}` : null]],
  ];

  const sections = [
    ['§ 1 Gegenstand und Dauer', [
      'Der Auftragsverarbeiter stellt dem Verantwortlichen die Web-Anwendung „QWERTZ Ninja“ zum Erlernen und Üben des Zehn-Finger-Tastschreibens bereit und betreibt sie. Dazu gehören Übungen, Lernkurs, Tests, praktische Leistungsnachweise (PLN) und deren Auswertung.',
      'Der Vertrag beginnt mit der Unterzeichnung und läuft auf unbestimmte Zeit. Er kann von beiden Seiten mit einer Frist von einem Monat zum Monatsende in Textform gekündigt werden. Das Recht zur außerordentlichen Kündigung bleibt unberührt.',
    ]],
    ['§ 2 Art und Zweck der Verarbeitung, Art der Daten, betroffene Personen', [
      'Zweck: Unterricht im Tastschreiben, Lernstandsrückmeldung an Schülerinnen und Schüler sowie Lehrkräfte, Durchführung und Auswertung von Tests und PLN.',
      'Betroffene Personen: Schülerinnen und Schüler, Lehrkräfte und mit der Verwaltung der Anwendung beauftragte Personen der Schule.',
      'Daten der Schülerinnen und Schüler: pseudonymer Benutzername und Anzeigename (ohne Klarnamen und ohne E-Mail-Adresse), Klassenzugehörigkeit, Passwort ausschließlich als Hash, Übungs- und Testergebnisse (Anschläge, Fehler, Dauer, Fehlerquote), Tastenstatistik und Fehleranalyse, Kursfortschritt, Punkte und Abzeichen, Abschriften aus PLN mit Notenvorschlag.',
      'Daten der Lehrkräfte und der Schuladministration: Benutzername, Anzeigename, Passwort ausschließlich als Hash, angelegte Klassen, Texte, Notenschlüssel, Aufgaben und PLN.',
      vidis
        ? 'Bei Anmeldung über den Vermittlungsdienst VIDIS erhält der Auftragsverarbeiter zusätzlich eine pseudonyme Kennung, die Rolle, die Schulkennung und das Bundesland, bei Lehrkräften gegebenenfalls Vor- und Nachname. Der Vermittlungsdienst wird nicht vom Auftragsverarbeiter beauftragt.'
        : null,
      'Technische Daten: ein Sitzungs-Cookie zur Anmeldung. Es gibt keine Tracking- oder Analyse-Cookies. IP-Adressen werden nur kurzzeitig im Arbeitsspeicher zur Begrenzung von Anmeldeversuchen verarbeitet und nicht gespeichert.',
      'Besondere Kategorien personenbezogener Daten nach Art. 9 DSGVO werden nicht verarbeitet.',
    ]],
    ['§ 3 Weisungen', [
      'Der Auftragsverarbeiter verarbeitet die Daten nur auf dokumentierte Weisung des Verantwortlichen, es sei denn, er ist durch Unionsrecht oder deutsches Recht dazu verpflichtet. Weisungen erfolgen in Textform. Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, weist er den Verantwortlichen unverzüglich darauf hin.',
    ]],
    ['§ 4 Pflichten des Auftragsverarbeiters', [
      'Der Auftragsverarbeiter verpflichtet alle Personen, die Zugang zu den Daten haben, zur Vertraulichkeit.',
      'Er trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO aus Anlage 1 und passt sie dem Stand der Technik an, ohne das Schutzniveau zu senken.',
      `Die Verarbeitung erfolgt ${op.location}. Eine Übermittlung in Drittländer findet nicht statt.`,
      'Er unterstützt den Verantwortlichen bei der Erfüllung der Rechte der betroffenen Personen (Art. 12 bis 23 DSGVO) und bei den Pflichten aus Art. 32 bis 36 DSGVO, insbesondere durch Auskunft, Export und Löschung von Daten.',
    ]],
    ['§ 5 Unterauftragsverarbeiter', [
      'Die bei Vertragsschluss eingesetzten Unterauftragsverarbeiter stehen in Anlage 2. Der Auftragsverarbeiter informiert den Verantwortlichen vorab in Textform über jede beabsichtigte Änderung. Der Verantwortliche kann binnen eines Monats widersprechen. Unterauftragsverarbeiter werden vertraglich auf dieselben Pflichten verpflichtet.',
    ]],
    ['§ 6 Verletzungen des Schutzes personenbezogener Daten', [
      'Der Auftragsverarbeiter meldet dem Verantwortlichen eine Verletzung des Schutzes personenbezogener Daten unverzüglich, möglichst innerhalb von 24 Stunden nach Bekanntwerden, mit den Angaben nach Art. 33 Abs. 3 DSGVO, soweit sie vorliegen.',
    ]],
    ['§ 7 Nachweise und Kontrollen', [
      'Der Auftragsverarbeiter stellt dem Verantwortlichen alle Informationen zum Nachweis der Einhaltung dieses Vertrags zur Verfügung und ermöglicht Überprüfungen nach rechtzeitiger Absprache.',
    ]],
    ['§ 8 Löschung und Rückgabe', [
      `Leistungsdaten (Ergebnisse, Tests, PLN, Fehleranalyse, Kursfortschritt, Punkte und Abzeichen) werden jedes Jahr am Tag nach dem eingestellten Schuljahresende (derzeit ${yearEnd}) automatisch gelöscht. Die Schule kann die Ergebnisse vorher exportieren. Konten und Klassen bleiben bestehen, bis die Schule sie löscht.`,
      'Nach Ende des Vertrags löscht der Auftragsverarbeiter alle Daten des Verantwortlichen innerhalb von 30 Tagen, sofern der Verantwortliche nicht vorher einen Export verlangt. Datensicherungen werden spätestens 30 Tage danach überschrieben. Die Löschung wird auf Wunsch in Textform bestätigt.',
    ]],
    ['§ 9 Haftung', ['Für die Haftung gilt Art. 82 DSGVO.']],
    ['§ 10 Schlussbestimmungen', [
      'Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Bei Widersprüchen gehen die Regelungen dieses Vertrags anderen Vereinbarungen der Parteien vor, soweit es um den Datenschutz geht.',
    ]],
  ];

  const toms = [
    ['Vertraulichkeit (Art. 32 Abs. 1 lit. b DSGVO)', [
      `Zutrittskontrolle: Der Server steht ${op.location} und ist nur dem Auftragsverarbeiter zugänglich.`,
      'Zugangskontrolle: Administration des Servers nur durch den Auftragsverarbeiter mit persönlichem Zugang. Anmeldung in der Anwendung nur mit Benutzername und Passwort oder über VIDIS. Passwörter werden mit scrypt gehasht, Anmeldeversuche werden begrenzt, Sitzungs-Cookies sind HttpOnly und SameSite=Strict.',
      'Zugriffskontrolle: Rollenkonzept. Schülerinnen und Schüler sehen nur ihre eigenen Daten, Lehrkräfte nur ihre eigenen Klassen, die Schuladministration nur ihre Schule. Der Betreiber verwaltet Schulen und Administrationskonten und hat in der Anwendung keinen Zugriff auf Leistungsdaten.',
      'Trennungskontrolle: Die Daten jeder Schule sind über eine Schulkennung getrennt; alle Abfragen sind auf die eigene Schule beschränkt.',
      'Pseudonymisierung: Schülerkonten tragen automatisch erzeugte Pseudonyme ohne Klarnamen und ohne E-Mail-Adresse. Die Zuordnung zu realen Personen kennt nur die Schule.',
    ]],
    ['Integrität (Art. 32 Abs. 1 lit. b DSGVO)', [
      https
        ? 'Weitergabekontrolle: Übertragung ausschließlich verschlüsselt per HTTPS (TLS) mit automatisch erneuerten Zertifikaten. Es werden keine externen Dienste, Schriftarten oder Skripte von Dritten eingebunden.'
        : 'Weitergabekontrolle: Es werden keine externen Dienste, Schriftarten oder Skripte von Dritten eingebunden. Bei Betrieb über das Internet erfolgt die Übertragung ausschließlich verschlüsselt per HTTPS (TLS).',
      'Eingabekontrolle: Ergebnisse und PLN-Abschriften werden mit Zeitstempel gespeichert; PLN-Abschriften werden nach Ablauf der Bearbeitungszeit nicht mehr verändert.',
    ]],
    ['Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b und c DSGVO)', [
      'Nächtliche Sicherung der Datenbank, die letzten 30 Sicherungen werden aufbewahrt. Automatische Sicherheitsupdates des Betriebssystems. Die Anwendung startet nach Störungen automatisch neu.',
    ]],
    ['Verfahren zur regelmäßigen Überprüfung (Art. 32 Abs. 1 lit. d DSGVO)', [
      'Updates werden aus einem versionierten Quellcode-Archiv eingespielt und vorher mit automatisierten Tests geprüft. Content-Security-Policy und weitere Sicherheits-Header im Browser. Keine Tracking- oder Analysewerkzeuge. Die Maßnahmen werden bei jeder wesentlichen Änderung, mindestens jährlich, überprüft.',
    ]],
  ];

  return { parties, sections, toms, subprocessors: op.subprocessors };
}

export function writeAvvPdf(out, data) {
  const { school } = data;
  const { parties, sections, toms, subprocessors } = avvSections(data);
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `Vertrag zur Auftragsverarbeitung – ${school.name}`, Author: 'QWERTZ Ninja' } });
  doc.pipe(out);
  const width = doc.page.width - 2 * MARGIN;
  const para = (t, opts = {}) => doc.font('Helvetica').fontSize(10).fillColor('#000').text(t, { width, align: 'justify', paragraphGap: 5, ...opts });
  const heading = (t, size = 11.5) => {
    if (doc.y > doc.page.height - MARGIN - 80) doc.addPage();
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(size).fillColor('#000').text(t, { width });
    doc.moveDown(0.25);
  };

  doc.font('Helvetica').fontSize(8.5).fillColor(GREY)
    .text(`Vorlage, erstellt mit QWERTZ Ninja am ${fmtDate(Date.now())}. Vor der Unterzeichnung bitte von der oder dem Datenschutzbeauftragten der Schule prüfen lassen.`, { width });
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#000').text('Vertrag zur Auftragsverarbeitung', { width });
  doc.font('Helvetica').fontSize(11).text('nach Art. 28 Datenschutz-Grundverordnung (DSGVO)', { width });
  doc.moveDown(1);
  para('zwischen');
  for (const [role, lines] of parties) {
    doc.font('Helvetica-Bold').fontSize(10.5).text(lines[0], { width });
    doc.font('Helvetica').fontSize(10);
    for (const l of lines.slice(1)) if (l) doc.text(l, { width });
    doc.font('Helvetica-Oblique').fillColor(GREY).text(`– nachfolgend „${role}“ –`, { width }).fillColor('#000');
    doc.moveDown(0.6);
    if (role === 'Verantwortlicher') para('und');
  }

  for (const [title, paras] of sections) {
    heading(title);
    for (const p of paras) if (p) para(p);
  }

  // Unterschriften
  if (doc.y > doc.page.height - MARGIN - 130) doc.addPage();
  doc.moveDown(2);
  const y = doc.y;
  const colW = (width - 30) / 2;
  const sig = (x, label, name) => {
    doc.font('Helvetica').fontSize(10).fillColor('#000').text('Ort, Datum', x, y, { width: colW });
    doc.moveTo(x, y + 45).lineTo(x + colW, y + 45).lineWidth(0.7).strokeColor('#000').stroke();
    doc.text(label, x, y + 50, { width: colW });
    doc.fillColor(GREY).text(name, x, y + 64, { width: colW }).fillColor('#000');
  };
  sig(MARGIN, 'Verantwortlicher (Schulleitung)', school.name);
  sig(MARGIN + colW + 30, 'Auftragsverarbeiter', parties[1][1][0]);
  doc.x = MARGIN;
  doc.y = y + 90;

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).text('Anlage 1: Technische und organisatorische Maßnahmen', { width });
  doc.moveDown(0.3);
  for (const [title, paras] of toms) {
    heading(title, 11);
    for (const p of paras) para(p);
  }
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(14).text('Anlage 2: Unterauftragsverarbeiter', { width });
  doc.moveDown(0.3);
  para(subprocessors);
  doc.end();
}
