# Mastermind – Projektkontext

Statische, deutschsprachige Lernwebseite für Informatik/Algorithmik, primär
für Laptops. Keine Abhängigkeiten, kein Backend; funktioniert auch per `file://`.

## Verhalten

- 2–4 Positionen, 2–6 Farben, Wiederholungen optional; Mensch als
  Codebreaker oder Codemaker, Computer übernimmt die andere Rolle.
- Begriffe durchgehend: Code, Guess, Testguess, Score.
- M blau, C violett; drei Schritte: Code wählen, Guess wählen, Score vergeben.
  Computeraktionen werden ca. 500 ms visualisiert.
- Farben über Kreise um den Pin wählen oder Farb-Pins durchklicken;
  Score-Pins: leer → weiss → schwarz → leer. Mensch/Codebreaker hat acht Guesses.
- Konfigurationsänderungen leeren sofort das Spiel und stoppen Worker/Animationen.
  Ein neues Spiel beginnt erst per Startknopf.

## Architektur und Explorer

- `game.js`: gekapselte Spiellogik und Score-Berechnung.
- `solver.js`: exaktes Knuth-Minimax über alle unbenutzten Testguesses aus G;
  bei Gleichstand Code in S bevorzugen, dann lexikografisch kleinster Code.
  Standardstart 1122; alle 1296 Standard-Codes in höchstens fünf Guesses.
- `app.js`: Spieloberfläche; `explorer.js`: Analyse und interaktive Schritte.
  Lokale Blob-Worker erhalten nur Konfiguration, Guesses und Scores, nie den Code.
  Identitäts-/Request-Prüfungen verhindern veraltete Antworten nach Neustarts.
- Explorer als Overlay: vollständiges U, bearbeitetes S, unbenutztes G.
  Vier Schritte: Guess aus G entfernen, inkompatible Codes aus S entfernen,
  minel für alle G berechnen, nächsten Guess wählen; jeweils mit Automatik.
- Sortierung an allen Spalten; Code-Suche scrollt zur Zeile. Hover/Fokus auf
  minel zeigt Score-Gruppen; Fragezeichen zeigt vollständigen Pseudocode.
- Fehlerdialoge korrigieren Ausschlüsse bzw. löschen falsche minel-Eingaben.
  Schritt 4 erlaubt jeden gültigen Guess, Abweichungen von Knuth nur als Hinweis.
  Übernahme füllt die Spieleingabe, gibt den Guess aber nicht ab.
- Codemaker-Explorer zeigt dieselben Schritte bereits automatisch erledigt.
  Ein Struktogramm ist noch nicht implementiert.

## Validierung

`node --test game.test.js solver.test.js explorer.test.js` (26 Tests).
Syntax: `node --check app.js` und `node --check explorer.js`.
UI zusätzlich im Browser prüfen: beide Rollen, Pin-Eingaben, Dialoge,
Sortierung, responsive Darstellung und Abbruch laufender Computeraktionen.

Details und Bedienung: `README.md`. GitHub Pages veröffentlicht `index.html`
und die lokalen Skripte/Styles direkt aus dem Root der Branch `main`.
