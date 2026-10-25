// Mitgelieferte Übungstexte. Alle Texte wurden eigens für QWERTZ Ninja geschrieben,
// es bestehen daher keine Rechte Dritter.
// Jeder Text ist zwischen 400 und 1500 Zeichen lang (test/content.test.js prüft das).
// Für längere PLN-Vorlagen werden mehrere Texte aneinandergehängt (server/pln.js).
// Die Schlüssel (key) nie ändern oder entfernen: Aufgaben verweisen auf diese Texte.
export const MIN_TEXT_CHARS = 400;
export const MAX_TEXT_CHARS = 1500;

export const BUILTIN_TEXTS = [
  {
    key: 'grundstellung-ruhe',
    title: 'Ruhe in der Grundstellung',
    content:
      'Wer schnell schreiben will, muss zuerst ruhig werden. Die Finger liegen locker auf der mittleren Reihe, die Daumen schweben über der Leertaste. Die Zeigefinger ertasten die kleinen Erhebungen auf F und J, so findet man die Grundstellung auch ohne hinzusehen. Jeder Anschlag kommt aus dem Finger, nicht aus dem ganzen Arm. Nach jedem Griff kehrt der Finger sofort in seine Ausgangsposition zurück. Die Handgelenke bleiben gerade, die Schultern locker. Wer das verinnerlicht hat, muss nicht mehr auf die Tasten schauen und kann sich ganz auf den Text konzentrieren.',
  },
  {
    key: 'bahnhof',
    title: 'Am Bahnhof',
    content:
      'Der Zug nach München hat heute zwölf Minuten Verspätung. Auf Gleis 4 drängen sich Pendler, Schülerinnen und ein paar Touristen mit großen Koffern. Ein älterer Herr fragt, ob der Anschluss in Augsburg noch erreicht wird. Die Durchsage bleibt vage: "Wir bitten um Ihr Verständnis." Kurz darauf springt die Anzeige auf zwanzig Minuten. Eine Mutter beruhigt ihr müdes Kind, zwei Studenten diskutieren über die nächste Prüfung, und am Kiosk bildet sich eine lange Schlange. Also holt man sich einen Kaffee, öffnet ein Buch und wartet geduldig. Als der Zug endlich einfährt, ist das Warten schnell vergessen.',
  },
  {
    key: 'fahrradtour',
    title: 'Eine Fahrradtour an der Isar',
    content:
      'Am Samstag fuhren wir mit dem Fahrrad an der Isar entlang. Morgens um acht trafen wir uns am Marienplatz, prüften noch einmal Luftdruck und Bremsen und rollten dann flussaufwärts aus der Stadt hinaus. Die Strecke war meist flach, nur kurz vor Wolfratshausen ging es steil bergauf. Mittags machten wir Pause an einer Kiesbank, aßen Brezen mit Butter und kühlten die Füße im eiskalten Wasser. Ein Floß mit fröhlichen Gästen trieb an uns vorbei, und von der Musik an Bord hörten wir noch lange etwas. Am Abend zeigte der Tacho 63 Kilometer. Müde, aber zufrieden, stiegen wir in die S-Bahn zurück.',
  },
  {
    key: 'bewerbung',
    title: 'Ein kurzes Anschreiben',
    content:
      'Sehr geehrte Frau Huber, mit großem Interesse habe ich Ihre Anzeige für einen Ausbildungsplatz als Kauffrau für Büromanagement gelesen. Zurzeit besuche ich die 10. Klasse und werde die Schule im Juli mit dem mittleren Schulabschluss beenden. In meinem Betriebspraktikum bei einer Steuerkanzlei durfte ich Post bearbeiten, Termine vereinbaren und Rechnungen erfassen. Dabei habe ich gemerkt, wie viel Freude mir die Arbeit im Büro macht. Ich arbeite gern im Team, bin zuverlässig und schreibe sicher mit zehn Fingern. Auch mit Tabellen und Textverarbeitung kenne ich mich gut aus. Über eine Einladung zu einem persönlichen Gespräch freue ich mich sehr. Mit freundlichen Grüßen',
  },
  {
    key: 'wetter',
    title: 'Wetterbericht',
    content:
      'Am Vormittag ziehen von Westen dichte Wolken auf, die im Laufe des Tages kräftigen Regen bringen. Im Bayerischen Wald sind oberhalb von 800 Metern sogar Schneeflocken möglich. Die Temperaturen erreichen höchstens 9 bis 13 Grad. Der Wind weht mäßig bis frisch aus Südwest, in Böen stürmisch. In der Nacht lässt der Regen nach, und bei Tiefstwerten um 3 Grad kann sich in Tälern Nebel bilden. Am Wochenende setzt sich wieder freundlicheres Wetter durch, mit Sonnenschein und bis zu 16 Grad.',
  },
  {
    key: 'kochen',
    title: 'Kaiserschmarrn',
    content:
      'Für vier Portionen trennt man sechs Eier. Das Eigelb wird mit 250 ml Milch, 150 g Mehl, einem Päckchen Vanillezucker und einer Prise Salz glatt gerührt. Wer mag, gibt eine Handvoll Rosinen dazu. Das Eiweiß schlägt man mit etwas Zucker steif und hebt es vorsichtig unter, damit der Teig schön luftig bleibt. In einer großen Pfanne Butter schmelzen, den Teig hineingießen und bei mittlerer Hitze stocken lassen. Danach wenden, mit zwei Gabeln in Stücke zerreißen und kurz mit etwas Zucker karamellisieren. Zum Schluss mit Puderzucker bestreuen und mit Apfelmus oder Zwetschgenröster servieren.',
  },
  {
    key: 'computer',
    title: 'Wie ein Computer rechnet',
    content:
      'Ein Prozessor kennt im Grunde nur zwei Zustände: Strom fließt oder fließt nicht. Aus diesen Nullen und Einsen setzt er Zahlen, Buchstaben und Bilder zusammen. Acht solcher Stellen ergeben ein Byte, mit dem sich 256 verschiedene Werte darstellen lassen. Für jeden Buchstaben auf der Tastatur gibt es eine eigene Zahl, und auch jeder Bildpunkt auf dem Bildschirm wird als Zahl gespeichert. Moderne Chips führen dabei mehrere Milliarden Befehle pro Sekunde aus. Dass wir davon nichts merken, liegt an vielen Schichten Software, die zwischen uns und der Hardware vermitteln.',
  },
  {
    key: 'bienen',
    title: 'Fleißige Bienen',
    content:
      'Eine Honigbiene besucht an einem einzigen Tag bis zu 3.000 Blüten. Für ein Glas Honig mit 500 Gramm müssen die Tiere zusammen etwa 120.000 Kilometer fliegen, das entspricht dreimal dem Erdumfang. Hat eine Biene eine gute Futterquelle gefunden, zeigt sie den anderen mit einem Tanz, in welcher Richtung und wie weit entfernt sie liegt. Dabei bestäuben die Bienen ganz nebenbei Obstbäume, Raps und Klee. Ohne sie fielen viele Ernten deutlich kleiner aus. Wer Bienen helfen will, sät im Garten oder auf dem Balkon heimische Wildblumen.',
  },
  {
    key: 'email',
    title: 'E-Mail an die Klasse',
    content:
      'Hallo zusammen, am Freitag, dem 14. März, findet unser Ausflug ins Deutsche Museum statt. Treffpunkt ist um 8:15 Uhr am Haupteingang. Bitte denkt an euren Schülerausweis, etwas zu trinken und 12 € für den Eintritt. Im Museum arbeiten wir in Gruppen zu je vier Personen, die Aufgabenblätter bekommt ihr vor Ort. Um 13:30 Uhr treffen wir uns wieder am Eingang und fahren gemeinsam zurück. Wer krank ist, meldet sich bitte bis 7:45 Uhr im Sekretariat ab. Rückfragen bitte an klasse10b@schule-beispiel.de. Viele Grüße und bis Freitag!',
  },
  {
    key: 'fussball',
    title: 'Das Spiel am Sonntag',
    content:
      'Schon vor dem Anpfiff war das Stadion bis auf den letzten Platz gefüllt. Die Gäste gingen früh in Führung, doch kurz vor der Pause glich unsere Mannschaft nach einem Eckball aus. In der zweiten Halbzeit drückten beide Teams aufs Tempo, und in der 89. Minute stand es immer noch 1:1. Dann setzte sich die Linksaußen auf der Seite durch, flankte präzise in den Strafraum, und die Stürmerin köpfte unhaltbar ins lange Eck. Der Jubel auf den Rängen war ohrenbetäubend. Nach dem Abpfiff sagte die Trainerin nur: "Wir haben nie aufgehört, an uns zu glauben."',
  },
  {
    key: 'mond',
    title: 'Der Mond',
    content:
      'Der Mond ist im Durchschnitt rund 384.400 Kilometer von der Erde entfernt. Er zeigt uns immer dieselbe Seite, weil er sich in genau der Zeit einmal um sich selbst dreht, in der er die Erde umkreist. Selbst leuchtet er nicht, er wirft nur das Licht der Sonne zurück. Je nachdem, wie Sonne, Erde und Mond zueinander stehen, sehen wir ihn als schmale Sichel, als Halbmond oder als volle Scheibe. Seine Anziehungskraft verursacht an den Küsten Ebbe und Flut. Zwischen 1969 und 1972 haben zwölf Menschen seine staubige Oberfläche betreten.',
  },
  {
    key: 'umzug',
    title: 'Der Umzug',
    content:
      'Kartons packen, Schränke abbauen, Lampen abschrauben: Ein Umzug ist anstrengender, als man denkt. Schon Wochen vorher stapelten sich bei uns die Kisten im Flur, und jedes Mal, wenn man etwas suchte, war es natürlich schon eingepackt. Zum Glück halfen am Ende sieben Freunde mit. Das Klavier blieb trotzdem im Treppenhaus stecken, und eine Schüssel ging zu Bruch. Abends saßen alle zwischen den Kisten auf dem Boden, aßen Pizza und lachten über den chaotischen Tag.',
  },
  {
    key: 'igel',
    title: 'Igel im Winter',
    content:
      'Wenn es im Herbst kälter wird und kaum noch Insekten zu finden sind, suchen sich Igel einen geschützten Platz für den Winterschlaf. Am liebsten bauen sie ihr Nest unter einem Laubhaufen, in einer Hecke oder unter einem Holzstapel. Vorher fressen sie sich ein dickes Fettpolster an, denn bis zum Frühjahr nehmen sie keine Nahrung mehr zu sich. Im Winterschlaf schlägt ihr Herz nur noch wenige Male pro Minute, und die Körpertemperatur sinkt auf etwa fünf Grad. Wer Igeln helfen will, lässt im Garten eine wilde Ecke mit Laub und Ästen stehen.',
  },
  {
    key: 'beschwerde',
    title: 'Eine Reklamation',
    content:
      'Sehr geehrte Damen und Herren, am 3. Mai habe ich in Ihrem Onlineshop einen Rucksack in der Farbe Dunkelblau bestellt (Bestellnummer 48-2210). Das Paket kam zwar pünktlich an, doch leider war der Rucksack grün statt blau. Außerdem klemmt der Reißverschluss des vorderen Fachs und lässt sich nur mit großer Mühe öffnen. Ich bitte Sie daher, mir den bestellten Rucksack in der richtigen Farbe zuzusenden. Den falschen Artikel schicke ich Ihnen gern zurück, sobald ich ein Rücksendeetikett erhalten habe. Sollte die Farbe nicht mehr lieferbar sein, bitte ich um Erstattung des Kaufpreises von 49,90 € auf mein Konto. Ich freue mich auf Ihre baldige Antwort. Mit freundlichen Grüßen',
  },
  {
    key: 'muell',
    title: 'Müll richtig trennen',
    content:
      'In Deutschland gehört der Müll nicht einfach in eine einzige Tonne. Verpackungen aus Kunststoff, Metall oder Verbundstoffen wie Getränkekartons kommen in den gelben Sack oder die gelbe Tonne. Papier, Pappe und Zeitungen wandern in die blaue Tonne. Obst- und Gemüsereste, Kaffeesatz und Gartenabfälle gehören in die Biotonne, aus ihrem Inhalt entstehen Kompost und Biogas. Glas bringt man zum Container und sortiert es nach Weiß-, Braun- und Grünglas. Alles, was sich nicht wiederverwerten lässt, landet im Restmüll. Batterien, alte Handys und Energiesparlampen dürfen dort aber nicht hinein, sie werden im Handel oder am Wertstoffhof gesammelt. Wer sorgfältig trennt, spart Rohstoffe und Energie.',
  },
  {
    key: 'spessart',
    title: 'Ein Herbsttag im Spessart',
    content:
      'Der Spessart ist eines der größten zusammenhängenden Laubwaldgebiete Deutschlands. Im Herbst leuchten die Buchen und Eichen in allen Farben zwischen Gelb, Orange und Dunkelrot. An einem sonnigen Oktobertag wanderten wir von unserem Dorf aus auf einem schmalen Pfad den Hang hinauf. Der Boden war weich vom Laub, und bei jedem Schritt raschelte es unter unseren Schuhen. Unterwegs sammelten wir Bucheckern und Kastanien, und einmal huschte ein Eichhörnchen mit einer Nuss im Maul über den Weg. Oben auf der Lichtung machten wir Rast, packten belegte Brote und heißen Tee aus und blickten über die bewaldeten Hügel bis hinunter ins Maintal. Auf dem Rückweg dämmerte es schon, und aus der Ferne hörten wir das Röhren eines Hirsches. Zu Hause waren unsere Beine schwer, aber die Köpfe herrlich frei.',
  },
  {
    key: 'wasser',
    title: 'Der Kreislauf des Wassers',
    content:
      'Das Wasser auf unserer Erde ist ständig unterwegs. Die Sonne erwärmt Meere, Seen und Flüsse, und ein Teil des Wassers verdunstet. Als unsichtbarer Wasserdampf steigt es in die Luft. Dort oben ist es kälter, der Dampf kühlt ab und bildet winzige Tröpfchen, aus denen Wolken entstehen. Werden die Tropfen schwer genug, fallen sie als Regen, Schnee oder Hagel zur Erde. Ein Teil davon fließt über Bäche und Flüsse direkt zurück ins Meer. Ein anderer Teil versickert im Boden und wird zu Grundwasser, aus dem wir einen großen Teil unseres Trinkwassers gewinnen. Auch Pflanzen nehmen Wasser mit ihren Wurzeln auf und geben es über die Blätter wieder an die Luft ab. So geht kein Tropfen verloren: Das Wasser, das heute aus unserem Wasserhahn kommt, war vielleicht vor langer Zeit Teil einer Wolke über dem Atlantik.',
  },
  {
    key: 'lernen',
    title: 'Gut vorbereitet in die Prüfung',
    content:
      'Viele Schülerinnen und Schüler beginnen erst am Abend vor einer Prüfung mit dem Lernen. Das kann gut gehen, ist aber meistens anstrengend und wenig wirksam. Besser ist es, den Stoff in kleine Portionen aufzuteilen und schon eine Woche vorher anzufangen. Jeden Tag eine halbe Stunde zu lernen, bringt mehr als fünf Stunden auf einmal. Hilfreich ist ein fester Arbeitsplatz, an dem das Handy außer Reichweite liegt. Wer den Stoff mit eigenen Worten zusammenfasst, auf Karteikarten schreibt oder jemand anderem erklärt, merkt sich deutlich mehr als beim bloßen Durchlesen. Regelmäßige Pausen sind dabei kein Zeichen von Faulheit, sondern geben dem Gehirn Zeit, das Gelernte zu ordnen. Auch Schlaf spielt eine wichtige Rolle, denn in der Nacht wird vieles im Gedächtnis gefestigt. Am Prüfungstag selbst hilft ein gutes Frühstück. Wer dann noch die Aufgaben in Ruhe liest und mit den leichten beginnt, hat die besten Chancen auf ein gutes Ergebnis.',
  },
  {
    key: 'praktikum',
    title: 'Mein Betriebspraktikum',
    content:
      'In der neunten Klasse habe ich zwei Wochen lang ein Praktikum in einer Schreinerei gemacht. Am ersten Tag war ich ziemlich aufgeregt. Der Meister zeigte mir die Werkstatt, erklärte die wichtigsten Sicherheitsregeln und gab mir Schutzbrille und Gehörschutz. An die großen Maschinen durfte ich natürlich nicht allein, aber ich konnte den Gesellen zusehen und viele Fragen stellen. Schon am zweiten Tag durfte ich Bretter abschleifen und Löcher für Schrauben bohren. Später half ich beim Bau eines Küchenschranks, den wir am Ende der Woche bei einer Familie einbauten. Besonders gefallen hat mir, dass man abends sehen konnte, was man geschafft hatte. Überrascht hat mich, wie viel am Computer geplant wird: Jedes Möbelstück wird zuerst gezeichnet und genau berechnet, bevor das erste Holz zugeschnitten wird. Auch Angebote und Rechnungen schreibt die Chefin selbst am Rechner. Anstrengend war das frühe Aufstehen, denn der Arbeitstag begann schon um sieben Uhr. Trotzdem kann ich mir gut vorstellen, nach der Schule eine Ausbildung in diesem Beruf zu beginnen.',
  },
  {
    key: 'main',
    title: 'Der Main',
    content:
      'Der Main ist mit rund 527 Kilometern einer der längsten Flüsse, die ganz in Deutschland verlaufen. Er entsteht bei Kulmbach in Oberfranken, wo der Weiße Main aus dem Fichtelgebirge und der Rote Main aus der Fränkischen Alb zusammenfließen. Von dort windet er sich in großen Schleifen durch Franken. Er fließt an Bamberg vorbei, durch Schweinfurt, Würzburg und Aschaffenburg und schließlich durch Frankfurt, bis er gegenüber von Mainz in den Rhein mündet. Weil sein Lauf so viele Kurven beschreibt, sprechen die Menschen in der Gegend gern vom Maindreieck und vom Mainviereck. Seit Jahrhunderten ist der Fluss ein wichtiger Verkehrsweg. Früher zogen Pferde die Lastkähne flussaufwärts, heute fahren große Frachtschiffe mit Kohle, Getreide oder Baustoffen. Über den Main-Donau-Kanal, der bei Bamberg beginnt, gelangen sie sogar bis zur Donau und weiter zum Schwarzen Meer. An den sonnigen Hängen im Maintal wachsen Weinreben, aus denen der bekannte Frankenwein gekeltert wird. Für Radfahrer gibt es einen Radweg, der fast den ganzen Fluss entlangführt. Wer ihn von der Quelle bis zur Mündung fährt, lernt viele Städte, Burgen und kleine Weinorte kennen.',
  },
  {
    key: 'energie',
    title: 'Energie sparen im Alltag',
    content:
      'Strom und Wärme kommen nicht einfach aus der Steckdose oder dem Heizkörper. Damit sie bei uns ankommen, müssen Kraftwerke, Windräder und Solaranlagen arbeiten, und jede Kilowattstunde kostet Geld und Rohstoffe. Zum Glück kann jeder mit einfachen Mitteln Energie sparen. Wer beim Verlassen eines Zimmers das Licht ausschaltet, spart schon eine Kleinigkeit. Mehr bringt es, Geräte wie Fernseher, Spielkonsole oder Computer ganz auszuschalten, statt sie im Bereitschaftsbetrieb zu lassen. Eine Steckerleiste mit Schalter macht das besonders leicht. In der Küche hilft ein Deckel auf dem Topf, denn so kocht das Wasser schneller. Der Kühlschrank sollte nicht neben dem Herd stehen und nur kurz geöffnet werden. Beim Heizen gilt: Jedes Grad weniger senkt den Verbrauch spürbar. Statt die Fenster stundenlang zu kippen, ist es besser, mehrmals am Tag für einige Minuten weit zu lüften. Auch warmes Wasser verbraucht viel Energie. Eine kurze Dusche statt eines Vollbads schont deshalb nicht nur den Geldbeutel der Familie, sondern auch das Klima. Viele kleine Schritte ergeben am Ende eine große Wirkung.',
  },
  {
    key: 'schrift',
    title: 'Eine kurze Geschichte der Schrift',
    content:
      'Lange bevor es Bücher, Briefe oder Bildschirme gab, verständigten sich die Menschen nur mit Worten und Zeichen. Wer etwas weitergeben wollte, musste es erzählen und darauf hoffen, dass die Zuhörer es sich merkten. Vor etwa fünftausend Jahren begannen Menschen in Mesopotamien, dem Gebiet zwischen Euphrat und Tigris, Zeichen in weiche Tontafeln zu drücken. Mit dieser Keilschrift hielten sie zunächst fest, wie viel Getreide, wie viele Schafe oder wie viel Bier jemand besaß. Etwa zur gleichen Zeit entwickelten die Ägypter ihre Hieroglyphen, kleine Bilder, die für Gegenstände, Silben oder Laute standen. Beide Schriften waren schwer zu lernen, und nur wenige Schreiber beherrschten sie. Einen großen Fortschritt brachte das Alphabet, bei dem jedes Zeichen einen einzelnen Laut darstellt. Die Phönizier verbreiteten es im Mittelmeerraum, die Griechen ergänzten Zeichen für die Vokale, und die Römer formten daraus die Buchstaben, die wir bis heute verwenden. Im Mittelalter schrieben Mönche Bücher noch mühsam von Hand ab, eine einzige Bibel konnte Jahre dauern. Um 1450 erfand Johannes Gutenberg in Mainz den Buchdruck mit beweglichen Lettern. Nun ließen sich Bücher schnell und günstig vervielfältigen, und immer mehr Menschen lernten lesen. Heute tippen wir unsere Texte meist auf einer Tastatur, doch die Buchstaben darauf haben eine Geschichte, die Jahrtausende zurückreicht.',
  },
  {
    key: 'pln-schreibmaschine',
    title: 'Von der Schreibmaschine zum Computer',
    content:
      'Die Tastatur, die wir täglich benutzen, ist deutlich älter als jedes elektronische Gerät. Ihre Geschichte beginnt im 19. Jahrhundert mit der Schreibmaschine. Die ersten Modelle waren schwer, laut und teuer. Wer auf ihnen schreiben wollte, musste kräftig auf die Tasten drücken, damit die kleinen Metallhebel mit den Buchstaben auf das Farbband und dann auf das Papier schlugen. Lagen häufig benutzte Buchstaben direkt nebeneinander, verhakten sich die Hebel beim schnellen Schreiben. Deshalb ordnete man die Tasten so an, dass oft verwendete Buchstabenpaare weiter auseinanderlagen. In Deutschland tauschte man später das Y und das Z, weil das Z im Deutschen viel häufiger vorkommt. Daher kommt der Name QWERTZ, der einfach die ersten sechs Buchstaben der oberen Reihe nennt. Mit der Schreibmaschine entstand auch das Zehnfingersystem. Jeder Finger bekommt dabei seine eigenen Tasten, und die Hände kehren nach jedem Anschlag in die Grundstellung zurück. Ein Fehler war damals ärgerlich, denn man musste ihn mühsam mit Korrekturflüssigkeit entfernen. Mit dem Computer änderte sich das grundlegend. Texte lassen sich seitdem am Bildschirm schreiben, verbessern und beliebig oft ausdrucken. Die alte Anordnung der Tasten ist trotzdem geblieben, denn Millionen von Menschen hatten sie bereits gelernt.',
  },
  {
    key: 'pln-wald',
    title: 'Ein Tag im Bayerischen Wald',
    content:
      'Der Nationalpark Bayerischer Wald ist der älteste Nationalpark Deutschlands. Er wurde im Jahr 1970 gegründet und liegt im Osten Bayerns an der Grenze zu Tschechien. Sein Leitgedanke lautet: Natur Natur sein lassen. Umgestürzte Bäume bleiben liegen, und auch der Borkenkäfer wird in großen Teilen des Parks nicht bekämpft. Zwischen den abgestorbenen Fichten wächst so ein neuer, bunt gemischter Wald heran. Unsere Klasse hat den Nationalpark im vergangenen Herbst besucht. Im Besucherzentrum erklärte uns eine Rangerin, wie wir uns verhalten sollen: auf den Wegen bleiben, keinen Müll zurücklassen und die Tiere nicht stören. Danach wanderten wir durch das Tier-Freigelände, in dem Luchse, Wölfe, Wildschweine und sogar Fischotter leben. Den Luchs haben wir leider nur kurz gesehen, umso länger beobachteten wir die Wölfe, die gemächlich über eine Lichtung trotteten. Am Nachmittag ging es zum Baumwipfelpfad. Auf einem Holzsteg spazierten wir zwischen den Baumkronen entlang, bis ein Weg in einem großen Turm spiralförmig nach oben führte. Von der Plattform aus blickten wir weit über die bewaldeten Hügel. Auf der Rückfahrt waren alle müde, doch es gab viel zu erzählen. Für den Unterricht sollen wir nun einen Bericht über den Ausflug schreiben, natürlich mit zehn Fingern.',
  },
  {
    key: 'pln-brot',
    title: 'Wie unser Brot entsteht',
    content:
      'Kaum ein Land hat so viele Brotsorten wie Deutschland. Mehr als dreitausend Sorten sind beim Deutschen Brotinstitut verzeichnet, vom hellen Weizenbrot bis zum dunklen Vollkornbrot. Am Anfang steht das Getreide. Weizen, Roggen oder Dinkel werden im Sommer geerntet, wenn die Körner reif und trocken sind. In der Mühle werden die Körner gereinigt und zwischen schweren Walzen zu Mehl gemahlen. Je nachdem, wie viel von der Schale im Mehl bleibt, ist es heller oder dunkler. In der Backstube beginnt die Arbeit meist schon mitten in der Nacht. Die Bäckerin mischt Mehl, Wasser, Salz und ein Triebmittel zu einem Teig. Für Weizenbrot verwendet man meist Hefe, für Roggenbrot dagegen Sauerteig, der dem Brot seinen leicht säuerlichen Geschmack gibt. Der Teig wird kräftig geknetet und muss danach ruhen und aufgehen. Dabei bilden sich viele kleine Gasbläschen, die das Brot später locker machen. Anschließend wird der Teig geteilt, zu Laiben geformt und bei über zweihundert Grad gebacken, bis eine knusprige Kruste entsteht. Leider wird noch immer viel Brot weggeworfen. Dabei lässt sich altes Brot gut für Semmelknödel, Brotsuppe oder Paniermehl verwenden. In einem Brotkasten aus Holz oder Ton bleibt es außerdem länger frisch.',
  },
];
