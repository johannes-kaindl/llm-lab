# Aufnahme-Vertrag — README-Bilder

Skill `readme-shots` (global). Treiber `scripts/shots.ts`, Brücke importiert aus
`../../tools/obsidian-cdp/` (Dach, nicht vendored). Fixture unter `docs/images/fixture/` —
derselbe Vault wie der GUI-Smoke (`scripts/gui-smoke.ts`, s. `docs/SMOKE.md`), keine zweite
Kulisse.

## Vorbedingungen, die dieser Vertrag NICHT selbst herstellt

1. **Staging-Vault offen in der REGULÄREN Instanz** (Port 9222) — Bilder sollen den echten
   Vault-Look zeigen, eine Zweitinstanz ist hier kein Ersatz (Dach-`AGENTS.md`). Der Vault
   muss von Hand als Fenster geöffnet sein (Vault-Wechsler → „Ordner als Vault öffnen"); ein
   Treiber kann das nicht selbst herstellen (s. Skill, Abschnitt „Vorbedingung").
2. **Obsidians Oberfläche läuft auf Englisch** (`document.documentElement.lang` beginnt mit
   `en`). Die Sprache ist app-weit und wirkt erst nach einem Neustart — der Treiber PRÜFT das
   vor dem ersten Bild und bricht mit Klartext ab, er stellt es nicht selbst um (das würde
   den Arbeits-Vault der regulären Instanz mit umstellen). Umstellen: Settings → About →
   Language → English, danach Obsidian neu starten (koordiniert, s. Dach-Regel „vor dem Quit
   fragen"), nach der Aufnahme zurückstellen.
3. **Der aktuelle Build ist deployt** (`npm run deploy`) und im laufenden Obsidian neu
   geladen (aus-/wieder einschalten) — sonst nimmt der Treiber den vorigen Stand auf, ohne
   dass ihm das auffällt (readme-shots-Fallentabelle).

Alle drei sind **Handgriffe des Maintainers**, kein Automatisierungsziel dieses Skripts.

## Bildvertrag

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero | README.md, README.de.md (Usage) | Den Bewerten-Tab (`LabView`, Ribbon-Icon „flask-conical") gefüllt mit mehreren Aufzeichnungen (Filter „Unrated only" aktiv), eine Zeile ausgewählt mit vollem Prompt/Antwort-Detail darunter und der Aktionsleiste (Good/Poor/Add tags, note, correction/Delete recording) |
| `settings.png` | feature | README.md (Configuration) | Den vollständigen Einstellungen-Tab: Record LLM calls, Keep traces for, Maximum trace size, Never record these features, Never record notes from these folders, Strict folder exclusion, Mask personal data in raw traces too, Additional terms to mask, plus die drei inhaltlich verbindlichen Hinweiszeilen (Where the data is stored, What masking does and does not catch, What the folder filter can and cannot see) |
| `rate-details.png` | detail | README.md (Usage) | Das Vertiefungs-Modal („Add detail to this rating") offen über einer Aufzeichnung: Tags, Note, die volle-Modalbreite-Textarea „Better answer" |
| `rate-empty.png` | detail | README.md (Usage) | Den Bewerten-Tab, bevor irgendeine Aufzeichnung angekommen ist — der Empty-State-Text („No recordings yet. …") |

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
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft — mitnutzen, nicht neu starten"
npm run deploy               # aktuellen Build in den Staging-Vault bringen
# im laufenden Obsidian: llm-lab aus- und wieder einschalten (Community plugins)
# Vault-Wechsler → llm-lab öffnen, falls noch nicht offen; Sprache prüfen (s. o.)
npm run shots -- --list      # Vertrag anzeigen
npm run shots                # alle vier Bilder
npm run shots -- --only hero.png   # ein Bild nachziehen
```

`--setup` existiert (baut den Vault aus `docs/images/fixture/` neu — identisch mit dem
GUI-Smoke-Setup), wird für einen laufenden Nachzieh-Lauf aber **nicht** gebraucht: der Vault
ist bereits gebaut und registriert, ein `--setup`-Lauf verlangt einen Obsidian-Neustart, den
dieser Vertrag genau deshalb vermeidet.
