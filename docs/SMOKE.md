# GUI-Smoke — was gegen ein laufendes Obsidian geprüft wird

`npm run smoke:gui` fährt die Abnahme-Prüfpunkte per CDP gegen ein **laufendes** Obsidian
(CORE-TEST-02 b). Der Treiber liegt in `scripts/gui-smoke.ts`, die CDP-Brücke kommt zentral
aus dem Dach (`../tools/obsidian-cdp/`) und wird importiert, nicht vendored.

**Warum dieses Repo ihn braucht:** Slice 1 hat 56 grüne Unit-Tests, aber `src/obsidian/vault_sink.ts`
ist die dünne Naht zu Obsidians `DataAdapter` und gegen einen Mock nicht prüfbar. Die
größenbasierte Rotation hängt daran, dass `adapter.stat()` für eine Datei unter `.obsidian/`
ein `size` liefert; tut sie das nicht, fällt der Code auf `0` zurück, die Summe ist immer 0,
die Grenze greift nie — und **nichts geht kaputt, es wächst nur still**.

Der Treiber spielt dabei den **Konsumenten selbst** (`api.log(...)` aus dem Renderer), statt
ein Nachbarplugin und einen LLM-Endpunkt vorauszusetzen. Was hier rot ist, ist im Lab kaputt
und nicht in der Verdrahtung eines Konsumenten.

## Aufruf

```bash
export STAGING_VAULTS_DIR="$HOME/StagingVaults"

# einmalig / nach Fixture-Änderungen: Aufnahme-Vault aus docs/images/fixture/ bauen
npm run build && npm run smoke:gui -- --setup
#   danach Obsidian beenden, den Vault in ~/Library/Application Support/obsidian/obsidian.json
#   auf "open": true setzen und neu starten:
#   pkill -x Obsidian && open -a Obsidian --args --remote-debugging-port=9222

npm run smoke:gui -- --vault llm-lab
```

`--vault` matcht exakt gegen `app.vault.getName()` (den Vault-**Ordnernamen**).
`--keep` lässt Einstellungen und erfundene Trace-Dateien stehen, `--ignore-deploy` übergeht
den Hash-Abgleich Arbeitsbaum ↔ Vault.

## Prüfpunkte (23)

| # | Prüft | Entspricht Handover-Schritt |
|---|---|---|
| 1–2 | Anbieter-Vertrag am lebenden Plugin-Objekt; `log()` gibt die id **synchron** zurück | — |
| 3 | Statusleiste: Icon **und** Text (der Lucide-Name muss real existieren) | 2 |
| 4–6 | Pause-Command schaltet um, pausiert wird nichts geschrieben, Rückschalten | 3 |
| 7 | Pause landet nicht in `data.json` und ist nach einem Reload weg | 4 |
| 8–9 | `log()` landet als JSONL-Zeile im Vault; Endpunkt nur als Host+Port | 6 (ohne Konsument) |
| 10 | `adapter.stat()` liefert eine echte Größe für eine Datei unter `.obsidian/` | **7** |
| 11–13 | Rotation wirkt: größenbasiert, altersbasiert, heutige Datei überlebt | — |
| 14 | Ausgeschlossenes Feature (`settings-probe`) wird nicht mitgeschrieben | 10 (ohne Konsument) |
| 15 | Hauptschalter aus: nichts geschrieben, `status()` sagt es | — |
| 16 | Bearer-Token im aufgezeichneten Text wird maskiert | — |
| 17–18 | PII per Default im Klartext (dokumentierte Asymmetrie); eingeschaltet record-weit **derselbe** Platzhalter | — |
| 19–21 | Settings-Tab: PII-Schalter über dem Feld, das nur mit ihm wirkt · Ablageort im Klartext · Grenzen der Maskierung sichtbar | 5 |
| 22 | `log()` wirft auch bei fehlerhaftem Input nicht | — |
| 23 | Ohne aktives Lab findet ein Konsument nichts und bricht nicht | 11 (ohne Konsument) |

### Was der Smoke NICHT abdeckt

Die **Verdrahtung eines echten Konsumenten** — Handover-Schritte 6, 8, 9, 10, 11 mit
`vault-rag` (Chat, Umformatieren, Smart Apply, Endpunkt-Testknopf, deaktiviertes Lab) — braucht
ein zweites Plugin und einen erreichbaren LLM-Endpunkt. Die Punkte 14 und 23 prüfen dieselbe
**Zusage** über den simulierten Konsumenten, nicht denselben **Weg**.

Der Reload in Punkt 7 ist `disablePlugin`/`enablePlugin`, nicht Obsidians `Cmd+R` — beides
lässt `onload` neu laufen, aber nur der App-Reload prüft zusätzlich, dass nichts in einer
anderen Schicht überdauert.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-08-23 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **23/23** | **19/23** mit vier eingebauten Defekten — genau die erwarteten Punkte rot, kein anderer fiel mit |

Die Gegenprobe baute gleichzeitig ein: `vault_sink.list` liefert `bytes: 0` (der stille
`stat()`-Fehlerfall) → Punkt 11 rot; Lucide-Icon `circle-dott` → Punkt 3 rot; `shouldLog`
ignoriert `excludedFeatures` → Punkt 14 rot; PII-Schalter unter das Begriffe-Feld verschoben →
Punkt 19 rot. **Punkt 10 blieb dabei grün** — `adapter.stat()` liefert weiterhin eine Größe,
nur liest sie niemand mehr. Die beiden Punkte messen also tatsächlich Verschiedenes; das ist
der Grund, warum die Wirkung (Punkt 11) zusätzlich zur Zahl (Punkt 10) geprüft wird.

## Konsumenten-Abnahme (Handover-Schritte 6, 8, 9, 10, 11)

Am 2026-08-23 einmalig von Hand gegen den echten Konsumenten gefahren — `vault-rag`
(Branch `feat/llm-lab-consumer`, 0.25.0) im selben Vault, LM Studio als Chat-Endpunkt
(CORS aktiv, aus dem Renderer gemessen), Ollama `qwen3-embedding:8b` für den Index
(5 Notizen). Nicht automatisiert: die Prüfpunkte gehören dem Konsumenten und damit in
`vault-rag/scripts/gui-smoke.ts`, nicht hierher.

| Schritt | Ergebnis |
|---|---|
| 6 · Chat | 🟢 eine Zeile `plugin: vault-retrieval`, `feature: chat`, `model`, `endpointHost: localhost:1234`, `latencyMs 38673`, `ttftMs 7489`, `finishReason: stop` |
| 8 · Umformatieren (LLM) | 🟢 `feature: reformat:to-list`, 8,8 s, `finishReason: stop` — die Notiz blieb unverändert, das Vorschau-Modal wurde ohne Anwenden geschlossen |
| 9 · Smart Apply | s. Vermerk unten |
| 10 · Endpunkt-Testknopf | 🟢 der Lauf fand statt (Notice „Thinking wird unterdrückt"), **keine** Zeile — `settings-probe` steht ab Werk in der Ausschlussliste |
| 11 · Lab deaktiviert | 🟢 Chat lief vollständig durch (Sende-Knopf zurück auf „Senden"), Antwort korrekt, keine Notice, **keine** Zeile |

**Ein Abbruch wird als solcher aufgezeichnet** (Nebenbefund): ein per „Stop" abgebrochener
Chat erzeugte eine Zeile mit `error: "Aborted"`, `ttftMs 2060`, `latencyMs 439980` — und
`response.content: ""`. Der bis zum Abbruch gestreamte Text geht dabei verloren; das ist
eine Eigenschaft des Konsumenten (`chat_client.ts` meldet im `catch` `content: ""`), nicht
des Labs, und für die Fehlersuche wäre der Teiltext der interessantere Teil.

### Was die Abnahme über das Datenmodell ergeben hat

**`systemPromptHash` trennt beim ersten realen Konsumenten keine Prompt-Fassungen, sondern
Aufrufe.** `record.ts` dokumentiert den Hash als „soll zwei Prompt-Fassungen unterscheidbar
machen". Gemessen: vault-rags Chat packt den kompletten Retrieval-Kontext **in die
System-Nachricht** (2557 Zeichen, Notizinhalte); zwei Fragen an denselben unveränderten
Prompt ergaben `43b854f4` und `93712a00`. Für eine Auswertung „hat Prompt-Version B besser
abgeschnitten als A" ist das Feld auf diesem Pfad damit wertlos — es gruppiert nichts.
Das ist kein Defekt in Slice 1 (der Hash tut, was der Code sagt), aber eine Annahme, die die
Bewertungs-Schicht nicht erben darf. Wer Slice 2 baut, braucht entweder einen Hash über den
**stabilen** Prompt-Anteil oder ein eigenes Feld dafür.
