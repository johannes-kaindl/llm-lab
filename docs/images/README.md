# Aufnahme-Vertrag — README-Bilder

Skill `readme-shots` (global). Treiber `scripts/shots.ts`, Brücke importiert aus
`../../tools/obsidian-cdp/` (Dach, nicht vendored). Fixture unter `docs/images/fixture/` —
derselbe Vault wie der GUI-Smoke (`scripts/gui-smoke.ts`, s. `docs/SMOKE.md`), keine zweite
Kulisse.

## Vorbedingungen, die dieser Vertrag NICHT selbst herstellt

1. **Zweitinstanz mit dem Staging-Vault** (eigenes Profil, eigener Port; seit Welle 21, vorher die reguläre Instanz). Die Bilder zeigen den Staging-Vault mit Fixture, nicht den Arbeits-Vault. Das Rezept steht im Kopf von `scripts/shots.ts` und im Dach-`AGENTS.md` § Staging-Vaults; die reguläre Instanz (9222) wird nie angefasst. `--port` ist Pflicht.
2. **Obsidians Oberfläche läuft auf Englisch** (`document.documentElement.lang` beginnt mit `en`). In der Zweitinstanz stellt `"language":"en"` in `$UD/obsidian.json` (plus `localStorage.language`) das her. Der Treiber PRÜFT das vor dem ersten Bild und bricht mit Klartext ab, er stellt es nicht selbst um.
3. **Der aktuelle Build ist deployt** (`npm run deploy`) und im laufenden Obsidian neu
   geladen (aus-/wieder einschalten) — sonst nimmt der Treiber den vorigen Stand auf, ohne
   dass ihm das auffällt (readme-shots-Fallentabelle).

Alle drei sind **Handgriffe des Maintainers** bzw. der aufnehmenden Session, kein Automatisierungsziel dieses Skripts.

## Bildvertrag

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero | README.md, README.de.md (Usage) | Den Bewerten-Tab (`LabView`, Ribbon-Icon „flask-conical") gefüllt mit mehreren Aufzeichnungen (Filter „Unrated only" aktiv), eine Zeile ausgewählt mit vollem Prompt/Antwort-Detail darunter und der Aktionsleiste (Good/Poor/Add tags, note, correction/Delete recording) |
| `settings.png` | feature | README.md (Configuration) | Den vollständigen Einstellungen-Tab: Record LLM calls, Keep traces for, Maximum trace size, Never record these features, Never record notes from these folders, Strict folder exclusion, Mask personal data in raw traces too, Additional terms to mask, plus die drei inhaltlich verbindlichen Hinweiszeilen (Where the data is stored, What masking does and does not catch, What the folder filter can and cannot see) |
| `rate-details.png` | detail | README.md (Usage) | Das Vertiefungs-Modal („Add detail to this rating") offen über einer Aufzeichnung: Tags, Note, die volle-Modalbreite-Textarea „Better answer" |
| `rate-empty.png` | detail | README.md (Usage) | Den Bewerten-Tab, bevor irgendeine Aufzeichnung angekommen ist — der Empty-State-Text („No recordings yet. …") |

## Fenstergröße je Bild

Der Treiber setzt die Fenstergröße je Bild vor der Aufnahme (`hoehe` und `breite` am `Shot`, sonst 1440 × 900). Gemessen wird mit `npm run shots:check` (`readme_lint`, `image-whitespace`: die längste Folge identischer Zeilen darf höchstens 25 % der Bildhöhe sein).

| Bild | Fenster | Warum |
|---|---|---|
| `hero.png` | 1440 × 760 | In 900 px Höhe füllt das Detail die Panelhöhe, zwischen „980 ms" und der Aktionsleiste bleibt eine leere Fläche (26 %); bei 760 px sind es 12 % und nichts ist abgeschnitten. Der Treiber wählt die Zeile der Suche (`koda-agent` / `search`), nicht „die erste": die vier Datensätze tragen denselben Zeitstempel auf die Minute, die Reihenfolge wechselt, und ein kurzes Detail ließ 49 % Leere. |
| `rate-empty.png` | 1000 × 900, unterer Rand 3 px | Bei 1440 px ist die längste Folge die Lücke zwischen Filterleiste und Textzeile (29 von 103 px, 28 %), ein Zuschnitt kürzt sie nicht. Bei 1000 px bricht die Textzeile um, der Streifen ist 213 px hoch, die längste Folge 52 px (24 %). |

`hero.png` seedet bis zu dreimal: die Bewerten-Ansicht zeigt nach dem Seeden gelegentlich „3 von 4" Zeilen, obwohl die Platte alle vier trägt (gemessen 2026-10-26, vier von acht Läufen, Ursache nicht geklärt); jeder Anlauf ab dem zweiten setzt zurück.

Kein GIF: nichts an dieser Oberfläche braucht Bewegung als Aussage (keine Animation, kein
Ablauf über Zeit) — der Durchratter-Rhythmus (`j`/`k`/`g`/`b`) ist Tastaturbedienung, kein
visuelles Ereignis.

## Beispieldaten für die Aufzeichnungen

Der Treiber seedet die Aufzeichnungen selbst über `api.log(...)` (derselbe Weg, den ein
Konsument nimmt — kein Fixture-JSONL, weil Traces zur Laufzeit entstehen, nicht aus einer
Datei geladen werden). Generisch und englisch, thematisch an die Fixture-Notizen angelehnt
(`docs/images/fixture/notes/Notes/*.md`) — keine echten Namen, Firmen, Nummern, Adressen:

- `vault-retrieval` / `chat` — eine Frage zur Notiz „Where the data lives" (wo Traces
  gespeichert werden)
- `vault-retrieval` / `chat` — eine Frage zur Notiz „Latency and first token"
- `vault-crews` / `reformat:to-list` — ein Absatz in eine Liste umgeformt
- `koda-agent` / `search` — eine Suche nach „Prompt versions"

Vor dem Seeden räumt der Treiber die Trace-/Datensatz-Dateien der Fixture-Installation weg
und lädt das Plugin neu (`disablePlugin`/`enablePlugin`) — der Staging-Vault ist Wegwerfware,
ein sauberer Ausgangszustand ist Teil des Rezepts, kein Seiteneffekt.

## Reproduktionsrezept

```bash
# Zweitinstanz wie im Kopf von scripts/shots.ts (Profil, Port, Vault, Englisch), Lock für den eigenen Port
npm run deploy               # aktuellen Build in den Staging-Vault bringen
npm run shots -- --list      # Vertrag anzeigen (ohne Port)
npm run shots -- --port <port>                  # alle vier Bilder
npm run shots -- --port <port> --only hero.png  # ein Bild nachziehen
```

`--setup` baut den Vault aus `docs/images/fixture/` neu (identisch mit dem GUI-Smoke-Setup); für einen Nachzieh-Lauf wird es nicht gebraucht. Die Zweitinstanz liest `obsidian.json` nur beim Start.

⚠️ **`--only hero.png` allein setzt die Traces NICHT zurück** (gemessen 2026-09-17): den
Reset erledigt nur `rate-empty.png` als erster Shot der vollen Sequenz — ein isolierter
`--only`-Nachzug von `hero.png` seedet auf einen bereits gefüllten Trace-Bestand drauf und
zeigt dann mehr Zeilen als der Vertrag nennt (z. B. „8 of 8" statt „4 of 4"). Vor einem
solchen Nachzug Traces/Dataset von Hand leeren und das Plugin aus-/wieder einschalten
(derselbe Schritt, den `zustandZuruecksetzen()` im Treiber automatisch macht), oder gleich
den vollen Lauf ohne `--only` fahren.
