# Mastermind

Eine statische, deutschsprachige Lernwebseite ohne externe Abhängigkeiten.

**Online:** https://nicolasruh.github.io/mastermind/

Repository: https://github.com/nicolasruh/mastermind

Kurzer Projektkontext: [context.md](./context.md).
GitHub Pages veröffentlicht die Dateien aus dem Root von `main` (`.nojekyll`).

## Starten

`index.html` direkt im Browser öffnen. Es ist kein Server, Konto oder
Installationsschritt nötig. Alle Schriften, Skripte und Styles sind lokal.

Alternativ aus diesem Verzeichnis einen lokalen Server starten:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Anschliessend `http://127.0.0.1:8000` öffnen.

## Spielen

- Es gibt immer einen Codemaker (legt den Code fest, vergibt Scores) und einen
  Codebreaker (wählt Guesses, um den Code zu finden). Die Konfiguration wählt
  die Rolle des Menschen; der Computer übernimmt die andere Rolle.
- Zwei Akteurskarten kennzeichnen Mensch (blau, M) und Computer (violett, C).
  Die Bezeichnungen und Aufgaben wechseln passend zur Rollenverteilung.
- 2–4 Positionen, 2–6 Farben, Wiederholungen optional.
- Ohne Wiederholungen: mindestens so viele Farben wie Positionen.
- Mensch / Codebreaker: acht Guesses; auch der achte erfolgreiche Guess zählt.
- Schwarz: richtige Farbe und Position. Weiss: richtige Farbe, falsche Position.
  Rückmeldungs-Pins sind nicht einzelnen Positionen zugeordnet.
- Ungültige Guesses zählen nicht. Als Mensch / Codebreaker erscheint der Code erst
  nach Spielende.
- Einstellungen werden nur beim Start eines neuen Spiels übernommen.
- Für jede Position eine Farbe über die nummerierten Farbkreise wählen.
  Alternativ auf den zunächst grauen Pin in der Mitte klicken: nächster Farbwert,
  nach der letzten Farbe wieder die erste. Beide Eingaben sind auch mit der
  Tastatur bedienbar. Nach einem abgegebenen Guess sind die Pins für den nächsten
  Guess wieder leer. Der Abgabeknopf wird bei gültiger vollständiger Auswahl
  kräftig eingefärbt.

- Rückmeldungs-Pins stehen in einem Raster mit zwei Spalten (2×2 bei vier Pins).
- Mensch / Codemaker startet mit verpflichtender Codeeingabe. Danach
  „Code festlegen“ bestätigen.
- Für jeden Computerzug frei wählen: Schwarze/weisse Pins selbst zählen und
  „Score bestätigen“ oder „Automatisch bewerten“ klicken. Die Score-Pins sind
  direkt anklickbar: leer → weiss → schwarz → leer. Die kompakten
  Schwarz-/Weiss-Dropdowns sind eine synchronisierte Alternative; leere Pins
  bedeuten Score (0, 0). Der Bestätigungsknopf wird nach der Bearbeitung
  kräftig eingefärbt; auch der anfänglich leere Score kann bestätigt werden.
- Die Webseite kennt den festgelegten Code zum Bewerten und meldet falsches
  Zählen konkret. Der Solver erhält ausschliesslich die bisherigen Versuche
  und Scores, niemals den Geheimcode.
- Unmögliche Scores werden ohne Verbrauch eines Guess abgewiesen.
  Mit „Letzten Score zurücknehmen“ lässt sich die letzte bestätigte Angabe
  zurücknehmen, auch nach Spielende. Mehrfaches Zurücknehmen ist möglich.
- Eine Schrittanzeige erklärt die nächste Aktion. Fehlende Eingaben werden
  mit konkreten Positions-/Pin-Hinweisen statt Browser-Standardmeldungen gemeldet.
- Jeder Neustart erhält eine neue sichtbare Spielnummer, setzt den Verlauf
  zurück und führt den Fokus zur ersten Farbauswahl. Beim Codemaker wird der
  Code neu festgelegt; beim Codebreaker wird ein neuer Zufallscode erzeugt
  (dieser kann zufällig mit dem vorherigen übereinstimmen).
- Jede Konfigurationsänderung leert sofort Code, Eingaben und Spielbrett,
  auch bei einer noch ungültigen Kombination. Laufende Berechnungen und
  Animationen werden abgebrochen. Erst „Neues Spiel starten“ beginnt wieder.
- Alle drei Schritte stehen als farbcodierte Bereiche im GUI: Code wählen,
  Guess wählen, Score vergeben. M ist blau, C violett. Computeraktionen werden
  mindestens rund eine halbe Sekunde angezeigt; im Codebreaker-Spiel erscheinen
  zunächst animierte Würfel, dann die Fragezeichen des geheimen Codes.
  Die Bewegung berücksichtigt `prefers-reduced-motion`.
- Ein Divider trennt die Zugeingabe vom Spielverlauf. Redundante Meldungen und
  Kandidatenzahlen entfallen dort; Mengenübersichten stehen im Explorer.

Die durchgehenden Begriffe sind Code (Geheimcode), Guess (abgegebener Guess),
Testguess (hypothetischer Guess zum Vergleich) und Score (schwarz, weiss).
Die Begriffshilfe enthält deutsche Erklärungen und Hover-Tooltips.

Der Solver betrachtet alle zulässigen Testguesses, nicht nur mögliche
Codes. Er minimiert die grösste Score-Gruppe und bevorzugt bei
Gleichstand mögliche Lösungen, danach die lexikografisch erste Farbfolge.
Im Standardspiel startet er mit `1122` und löst jeden der 1296 Codes in
höchstens fünf Guesses. Für andere Konfigurationen gilt diese Schranke nicht;
Computer / Codebreaker hat deshalb kein festes Guess-Limit.

Berechnungen laufen in einem lokalen Web Worker, damit die Oberfläche bedienbar
bleibt. Ein Blob-Worker ermöglicht den direkten Start per `file://`.
Bei Neustart wird eine laufende Berechnung beendet. Worker-Fehler und eine
Zeitüberschreitung nach 30 Sekunden werden angezeigt; es gibt keinen
heuristischen Ersatz für das exakte Minimax.

## Knuth-Explorer

Der Knopf rechts öffnet den Explorer als modales Overlay. Schliessen per Knopf,
Escape oder Klick ausserhalb; das Spiel bleibt darunter erhalten. Oben stehen
der ausgewertete Guess und sein Score. Vor dem ersten Computer-Score wird der
erste Guess mit „Noch ausstehend“ angezeigt.

Beide Rollen verwenden dieselbe vollständige, scrollbar-sortierbare Codeliste.
Die hervorgehobene Tabellenlegende enthält Definitionen und aktuelle Grössen:

- U: unveränderliches Universum aller zulässigen Codes, im Standardspiel 1296.
- S: kompatible Codes. Schritt 2 aktualisiert die Arbeitsmenge vor dem letzten
  Score auf die mit allen bisherigen Scores kompatible Menge.
- G: noch nicht als Guess gespielte Codes aus U, die als Testguess dienen können.
  Ein Code ausserhalb S kann trotzdem in G liegen.

Die Übersichten zeigen die Mengen immer relativ zu U, etwa `208/1296 Codes`.
Die Tabelle enthält immer ganz U. Die feste Spalte `idx` nummeriert die Codes
ab 0. Jede Spalte hat eigene Auf-/Ab-Sortierknöpfe; beim Sortieren springt die
Tabelle nach oben und die Mengen bleiben unverändert. Hover oder Tastaturfokus
auf den Spaltennamen oder dem Augensymbol bei S, G, Score und minel zeigt die aktuelle Verteilung
über ganz U, einschliesslich noch nicht berechneter oder nicht anwendbarer Werte.
Die Lupe im Code-Spaltenkopf öffnet die Suche;
sie springt zur gesuchten Zeile, ohne andere Codes auszublenden. Es gibt keine separate
Toolbar, Beispielauswahl oder Seitenwechsel.
Das Fragezeichen neben der Explorer-Überschrift zeigt den vollständigen
Knuth-Pseudocode per Hover, Tastaturfokus oder Klick.

### Vier aufeinanderfolgende Schritte

1. Letzten Guess in der Spalte G abwählen. Nur dieser Code darf entfernt werden.
   Die abgewählte Tickbox bleibt orange markiert.
2. In der Spalte S alle Codes abwählen, deren Score gegen den letzten Guess
   nicht zum Score oben passt. Falsche Ausschlüsse werden erklärt und sofort
   zurückgenommen. Neu ausgeschlossene Zeilen sind dunkelgrau, früher
   ausgeschlossene hellgrau; verbleibende Codes in S sind grün hervorgehoben.
3. Für **alle Testguesses aus G**, auch ausserhalb S, minel bestimmen.
   Hover oder Tastaturfokus auf ein minel-Feld zeigt die vollständige Gruppierung
   von S für den Code dieser Zeile als Testguess. Gruppengrössen und die grösste
   Gruppe sind sichtbar: `minel = |S| − Grösse der grössten Score-Gruppe`.
   Werte mit Enter oder beim Verlassen des Feldes bestätigen. Falsche Eingaben
   zählen nicht als erledigt und werden gelöscht. Null ist ein gültiger
   minel-Wert. Die Gruppierung zeigt keine ausgerechnete minel-Subtraktion.
4. Jeden gültigen Guess aus U ins Textfeld eintragen und wählen. Auch ein
   bereits gespielter oder nicht optimaler Guess darf übernommen werden;
   eine Abweichung von Knuth erscheint darunter als dunkelorangener Hinweis,
   ohne die Übernahme zu sperren. Die automatische Wahl bleibt exaktes Knuth:
   grösstes minel, Code in S bevorzugen, dann kleinster Code; Standardstart `1122`.

Falsche manuelle Ausschlüsse und minel-Eingaben werden in einem Hinweisdialog
erklärt (OK oder Escape), nicht durch rote Zeilenrahmen. Ausschlüsse werden
zurückgenommen; minel-Eingaben bleiben bis zur korrekten Eingabe unerledigt.
Escape schliesst dabei nur den Hinweisdialog, nicht auch den Explorer.

Jeder Schritt bietet „Automatisch erledigen“, Schritt 3 das Ausfüllen aller
minel-Werte. Die Automatik wirkt auf die vollständigen Mengen, unabhängig von
Suche oder Sortierung. Spätere Schritte bleiben gesperrt, bis der aktuelle korrekt
erledigt ist. Ohne vorherigen Guess/Score werden die ersten beiden Schritte
übersprungen. Bereits früher gespielte Guesses werden nicht nochmals entfernt.

Die Score-Spalte bewertet jede Codezeile gegen den **letzten gespielten Guess**.
Das minel-Feld betrachtet dagegen den Code dieser Zeile als **neuen Testguess**.
Beim Sortieren nach minel erscheinen nur bereits bestätigte Werte zuerst;
unberechnete Werte werden nicht durch ihre Reihenfolge vorweggenommen.

### Mensch / Codemaker

Der Explorer erklärt den aktuellen Guess von Computer / Codebreaker.
Alle vier Schritte sind bereits automatisch erledigt. Ausschlüsse, minel-Werte
und der gewählte nächste Guess bleiben sichtbar. Die Gruppierungen lassen sich
für jeden Testguess ansehen. Das Overlay verändert weder den Computer-Guess
noch den festgelegten Code.

### Mensch / Codebreaker

Der Explorer kennt nur die bisherigen Guesses und Scores, nicht den Code.
S beginnt vor dem letzten Score, G vor dem letzten Guess. Der Mensch erledigt
die vier Schritte über dieselbe Tabelle. „Guess ins Spielbrett übernehmen“
schliesst das Overlay und kopiert den gewählten gültigen Guess in die Spieleingabe,
gibt ihn aber noch nicht ab.

Nach jedem Guess beginnt die Arbeit mit dem aktualisierten Verlauf neu.
Schliessen und erneutes Öffnen erhält den Fortschritt derselben Berechnung.
Bei Spielende zeigt der Explorer automatisch die aktualisierten Mengen;
eine Übernahme ist nicht mehr möglich. Die Fünf-Guesses-Garantie gilt nur für die unveränderte
Standardstrategie ab Guess `1122`, nicht für beliebige menschliche Vorgeschichten.

Ein Struktogramm ist noch nicht implementiert.

## Struktur und Tests

- `game.js`: unabhängige Spiellogik und Bewertung, im Browser und in Node nutzbar.
- `app.js`: Oberfläche und Eingabeverarbeitung.
- `solver.js`: exakter Solver und lokaler Worker.
- `explorer.js`: Overlay, vierstufiges Mengenmodell und geprüfte Tabelleninteraktionen.
- `styles.css`: responsive Laptop- und Mobilansicht.
- `game.test.js`: Tests ohne zusätzliche Pakete (Node.js ab Version 18).
- `solver.test.js`: vollständige Entscheidungsbäume aller zulässigen
  Konfigurationen, Fünf-Versuche-Garantie, Minimax- und Konsistenztests.
- `explorer.test.js`: vollständige Mengen, Score-Filter, exakte Gruppen,
  Sortierung, Schrittfolge, manuelle/automatische Ausschlüsse und minel-Werte,
  Testguesses ausserhalb S, wiederholte Guesses und Spielende.

```sh
node --test game.test.js solver.test.js explorer.test.js
node --check app.js
node --check solver.js
node --check explorer.js
```

Die Tests prüfen insbesondere Farbwiederholungen, alle 6561 Code-/Versuchspaare
mit vier Positionen und drei Farben, Konfigurationsgrenzen, Sieg/Niederlage,
Zustandskapselung und gültige Zufallscodes.
