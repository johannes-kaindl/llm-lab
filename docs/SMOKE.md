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

**Der Treiber lädt das Plugin selbst neu, bevor der erste inhaltliche Prüfpunkt läuft.**
Grund: der Hash-Abgleich oben vergleicht nur **Dateien** (Arbeitsbaum vs. Vault), nicht was
Obsidian gerade **geladen** hat. Das Plugin-Objekt im laufenden Fenster stammt vom letzten
`enablePlugin` — typischerweise dem Öffnen des Vaults — und kann damit älter sein als der
gerade deployte Stand, selbst wenn der Hash-Abgleich grün ist. Gemessen am 2026-08-23: ein
Lauf ohne den frühen Reload maß in einem länger offenen Vault-Fenster `apiVersion 1`, obwohl
`main.js` längst `apiVersion 2` baute — ein falscher Befund, kein echter Regress. Der Reload
direkt nach dem Hash-Abgleich (derselbe Mechanismus wie in Prüfpunkt 7,
`disablePlugin`/`enablePlugin` + Warten auf `api.status()`) schließt das.

## Prüfpunkte (32)

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
| 16b–16c | Per `log()` mitgelieferter Endpunkt-Schlüssel wird exakt maskiert; der Schlüssel selbst steht nicht im Record | — |
| 16d–16e | Ordner-Filter: ein nicht ausgeschlossener Pfad wird mitgeschrieben (Gegenprobe zuerst) · ein ausgeschlossener Pfad erzeugt keinen Record | — |
| 17–18 | PII per Default im Klartext (dokumentierte Asymmetrie); eingeschaltet record-weit **derselbe** Platzhalter | — |
| 19–21 | Settings-Tab: PII-Schalter über dem Feld, das nur mit ihm wirkt · Ablageort im Klartext · Grenzen der Maskierung sichtbar | 5 |
| 22–26 | Deklarative Settings-API (s. unten) | — |
| 27 | `log()` wirft auch bei fehlerhaftem Input nicht | — |
| 28 | Ohne aktives Lab findet ein Konsument nichts und bricht nicht | 11 (ohne Konsument) |

Die vier neuen Punkte (16b–16e, Slice-2-Vertragserweiterung) sitzen bewusst direkt nach dem
Bearer-Punkt (16), nicht am Ende der Liste: sie prüfen dieselbe Zeile im Vertrag (Schlüssel-
Maskierung, jetzt mit echter Schlüsselliste statt der leeren aus Slice 1) bzw. den neuen
Ordner-Filter. **Reihenfolge innerhalb der vier ist Absicht:** die Gegenprobe (16d, ein nicht
ausgeschlossener Pfad kommt an) steht vor der Abwesenheitsmessung (16e, ein ausgeschlossener
Pfad erzeugt nichts) — ein Punkt, der Abwesenheit misst, muss vorher belegen, dass unter den
gleichen Bedingungen überhaupt geschrieben würde, sonst ist er auch dann grün, wenn gerade gar
nichts funktioniert.

### Die fünf Punkte zur deklarativen Settings-API (22–26)

Dazugekommen mit der Migration auf `getSettingDefinitions()` (0.2.0). Sie messen den Pfad,
den **keine** vitest-Suite erreicht — und den es im Alltag doppelt gibt:

| # | Prüft | Warum er nicht weggelassen werden kann |
|---|---|---|
| 22 | `getSettingDefinitions()` liefert Zeilen **und der Host hat sie übernommen** (`tab.settingItems`) | Was das Plugin anbietet und was der Host indiziert, sind zwei Messungen. Nur die zweite entscheidet über die Einstellungs-Suche. |
| 23 | Nativer Pfad und `display()`-Fallback zeichnen **dieselbe** Zeilenzahl | Eine Zeile ohne Regler überspringt der native 1.13-Renderer stillschweigend, während der Walker sie zeichnet. Unter 1.13 fällt das nie auf. |
| 24 | MB↔Byte-Übersetzung läuft in beide Richtungen rund | Die Zeile heißt „(MB)", gespeichert werden Bytes. Die Übersetzung lebt nur im Host, in keinem Unit-Test. |
| 25 | Eine ungültige Zahl wird **auch ohne `validate()`** verworfen | `validate` wertet nur der native Renderer aus; der Kit-Walker kennt es nicht. Ohne eigene Wache schriebe der Fallback-Pfad `NaN`. |
| 26 | Einstellungen sind über Obsidians Einstellungs-Suche auffindbar | Das ist der reale Nutzen der Migration — genau das, was die Store-Warnung `prefer-setting-definitions` bemängelt. |

Zwei Fallen, beide am 2026-08-23 gegen 1.13.7 gemessen und beide sahen zuerst wie ein
Plugin-Defekt aus: das Suchfeld reagiert **nicht** auf `feld.value = x` (es braucht den
nativen Prototyp-Setter), und die Treffer stehen in `.setting-search-result-tab`, nicht in
einem `.setting-item`-Container. Ein geratener Selektor zählt dort immer 0 — und meldet damit
„nicht auffindbar" für ein Plugin, das auffindbar ist.

⚠️ **Punkt 23 taugt nicht als Vorher/Nachher-Beleg**, und das ist seine Bauart, kein Mangel:
vor der Migration existiert kein nativer Pfad, er vergleicht dort zweimal dasselbe `display()`
und ist zwangsläufig grün. Er bewacht den neuen Zustand gegen künftige Drift zwischen den
Pfaden; die Vorher/Nachher-Aussage tragen 22, 24, 25 und 26.

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
| 2026-08-30 | 1.13.7 (Vault `llm-lab`, Oberfläche en) | **38/38 grün** — Task 8 (`promptTemplateHash`, `apiVersion` 2 → 3), Branch `feat/prompttemplate-hash` `e50f0ba` | Vertrags-Prüfpunkt meldet `apiVersion 3` (nicht 2) — der Treiber lädt das Plugin zu Beginn frisch, der Fund wäre also ein veralteter Deploy, nicht Code |
| 2026-08-24 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **38/38 grün** — Lauf vor dem 0.3.0-Release, nach der Wortlaut-Präzisierung der Ordner-Filter-Grenze (Settings-Text + beide READMEs) | — Text-, keine Struktur-Änderung; die drei `render`-Hatches und beide Renderer-Pfade sind im selben Lauf namentlich nachgewiesen |
| 2026-08-23 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **23/23** | **19/23** mit vier eingebauten Defekten — genau die erwarteten Punkte rot, kein anderer fiel mit |
| 2026-08-23 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **28/28** nach der Settings-API-Migration | **24/28** gegen den 0.1.0-Stand aus git (gebaut und deployt, derselbe neue Treiber): 22, 24, 25 und 26 rot, kein anderer fiel mit. Punkt 23 blieb erwartungsgemäß grün (s. Warnung oben). Punkt 26 trägt zusätzlich eine Gegenprobe im selben Lauf: Suchbegriff aus der eigenen Definition → 1 Treffer, Unsinn-Begriff → 0 |
| 2026-08-23 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **28/28 grün** · **Baseline vor dem Treiber-Umbau der Slice-2-Vertragserweiterung** (mit den Kernänderungen, Treiber noch unverändert). Festgehalten, damit der Lauf nach dem Umbau von „anders grün" unterscheidbar bleibt. | — |
| 2026-08-23 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **31/32** nach den vier neuen Prüfpunkten (16b–16e) für Schlüssel-Maskierung und Ordner-Filter — alle vier grün, die restlichen 27 der 28 alten Punkte unverändert grün. **Ein Befund, keine Nebenwirkung dieses Tasks:** Punkt 1 („Anbieter-Vertrag haengt am Plugin-Objekt … apiVersion, status, log") ist rot — der Treiber prüft `apiVersion === 1`, das Plugin liefert seit `431c23c` (`feat(api)!: apiVersion 2 — secrets und contextPaths auf LabLogInput`) `apiVersion 2`. Der Treiber wurde in dieser Session bewusst NICHT angepasst (Auftrag: keine Anpassung des Prüfpunkts an vorgefundenes Verhalten, kein Anfassen von Produktivcode) — Nacharbeit ist, die Konstante im Treiber auf `2` zu heben. **Behoben in der Fix-Runde 1 unten**, s. dort — die Ursache war nicht der Prüfpunkt selbst, sondern ein fehlender Reload vor den frühen Prüfpunkten. | — |
| 2026-08-24 | 1.13.7 (Vault `llm-lab`, Oberfläche de) | **32/32 grün** — Fix-Runde 1 zu Task 6. Zwei Änderungen: (a) der Treiber lädt das Plugin jetzt direkt nach dem Hash-Abgleich neu, bevor der erste inhaltliche Prüfpunkt läuft (s. Hinweis unter „Aufruf"); (b) `vertrag.apiVersion === 1` im Vertrags-Prüfpunkt auf `=== 2` gehoben, mit Kommentar, dass diese Zahl bei jedem `LLM_LAB_API_VERSION`-Bump als Vertragskopie mitzieht — genau wie vault-rags `lab_client.ts`. Punkt 7 („Pause ueberlebt einen Neustart NICHT") blieb dabei unangetastet und weiterhin korrekt: `data.json traegt "paused": false · nach Reload recording true` — der vorgezogene Reload läuft vor Punkt 7s eigenem Toggle/Reload-Zyklus und stört ihn nicht, weil `paused` Sitzungszustand ist und über keinen Reload hinweg gesetzt bleibt. Alle 28 alten Punkte grün, keine Verschiebung sonst. | — |

Die Gegenprobe baute gleichzeitig ein: `vault_sink.list` liefert `bytes: 0` (der stille
`stat()`-Fehlerfall) → Punkt 11 rot; Lucide-Icon `circle-dott` → Punkt 3 rot; `shouldLog`
ignoriert `excludedFeatures` → Punkt 14 rot; PII-Schalter unter das Begriffe-Feld verschoben →
Punkt 19 rot. **Punkt 10 blieb dabei grün** — `adapter.stat()` liefert weiterhin eine Größe,
nur liest sie niemand mehr. Die beiden Punkte messen also tatsächlich Verschiedenes; das ist
der Grund, warum die Wirkung (Punkt 11) zusätzlich zur Zahl (Punkt 10) geprüft wird.

## Ende-zu-Ende ueber die Plugin-Grenze — 2026-08-24, 9/9 gruen; erneut 2026-08-30, 9/9 gruen

**2026-08-30 (Task 8, `promptTemplateHash`/`apiVersion` 3, `feat/prompttemplate-hash`
`e50f0ba` / vault-rag `1df2cd1`):** unveraendert 9/9, inklusive der Gegenprobe mit
ausgeschlossenem Ordner. `apiVersion 3` am laufenden Plugin bestaetigt, der Feldname im
geschriebenen Record ist `promptTemplateHash` (nicht mehr `systemPromptHash`).

**Treiber-Befund, kein Produktbefund:** `scripts/e2e-crossplugin.ts` wrappt `api.log` mit
einem durchreichenden Spy und raeumt am Ende nur `window.__e2e` weg
(`delete window.__e2e;`), nicht den Wrapper selbst. Ein Folgeaufruf von `api.log` in
derselben Fenster-Sitzung crasht dann in der toten Closure (`Cannot read properties of
undefined (reading 'push')`) — **bevor** die echte Implementierung erreicht wird, was wie
„log() schreibt nichts" aussieht. Gemessen bei der Vorbereitung von Step 5 (Handmessung im
selben Fenster direkt nach `npm run smoke:e2e`). Umgehung fuer jede Handmessung danach: die
beiden Plugins per `disablePlugin`/`enablePlugin` neu laden (macht der Treiber selbst zu
Beginn seines eigenen Laufs — nur eben nicht am Ende fuer den, der nach ihm misst). Nicht
behoben (Auftrag: keine Aenderung an Treibern/Produktivcode in dieser Task), nur
diagnostiziert und umgangen.

Getrackt als `scripts/e2e-crossplugin.ts` (`npm run smoke:e2e`) — **nicht** Teil von
`npm run gate` oder `smoke:gui`, weil er als einziger Treiber eine Fremdinstallation
voraussetzt (beide Plugins echt im selben Vault, erreichbarer Chat-Endpunkt).

**Warum das ein eigener Lauf ist und kein Pruefpunkt im Treiber:** unser GUI-Smoke ruft
`api.log()` selbst auf, vault-rags ruft ein Lab-**Stub** auf. Beide Treiber ueberspringen damit
genau die Strecke, die Slice 2 neu verdrahtet hat — vault-rag → Plugin-Grenze → llm-lab → Platte.
Gefahren im Vault `llm-lab` (beide Plugins echt installiert), mit einem **durchreichenden**
Spy auf `api.log` (wrappt und ruft das Original), damit die echte Strecke vollstaendig bleibt.

Gemessen: `apiVersion 2` am laufenden Plugin · ein Chat ueber die Oberflaeche erzeugt **eine**
Trace-Zeile (`plugin=vault-retrieval`, `feature=chat`) · `contextPaths` steht **nicht** im
geschriebenen Record, obwohl vault-rag fuenf Pfade ueber die Grenze mitschickte (Steuerdatum,
kein Inhalt — die Zusage haelt) · Gegenprobe mit `excludedFolders: ["Notes"]` und `strict`:
**keine** neue Zeile, waehrend `api.log()` nachweislich gerufen wurde und der Chat ungestoert
durchlief (der Filter bremst den Konsumenten nicht).

**Der Lauf hat eine Grenze der Nutzer-Zusage gefunden, die so nirgends stand — und sie sitzt
im Treiber-Bau, nicht im Produktivcode.** Der erste Versuch meldete „vault-rag schickte KEINE
contextPaths", und die Gegenprobe schrieb trotz Ausschluss eine Zeile. Ursache: `currentPaths()`
ist `pinned ∪ autoDocs`, und `autoDocs` fuellt ein 400-ms-Debounce beim Tippen, den `submit()`
ausdruecklich abbricht. Ein Treiber, der den Text setzt und **sofort** klickt, sendet garantiert
ohne Kontext — ein Mensch tippt und wartet. Nach dem Warten auf die Kontext-Chips: fuenf Pfade,
alles gruen.

Zwei Folgerungen ueber diesen Lauf hinaus:
- **Wer eine Oberflaeche skriptet, muss ihre Debounces mitspielen, nicht ueberholen.** Sonst
  misst man einen Zustand, den ein Benutzer nie erzeugt — und haelt ihn fuer einen Defekt.
- **Die Ordner-Filter-Zusage laeuft je AUFRUF, nicht je Plugin.** Ein Chat ohne angehaengte
  Kontextnotizen meldet keine Pfade und wird deshalb auch bei ausgeschlossenem Ordner
  mitgeschrieben — korrekt (keine Notiz beteiligt, nichts auszuschliessen), aber die
  Formulierung im Settings-Tab und in beiden READMEs sprach von *Plugins* und legte damit
  „vault-rag meldet Pfade, also ist vault-rag abgedeckt" nahe. Wortlaut am 2026-08-24
  praezisiert.

## Gegenprobe `promptTemplateHash` — 2026-08-30, die eigentliche Abnahme des Vorhabens

Task 8 (`promptTemplateHash`, `apiVersion` 2 → 3) loest genau das Problem, das die
Konsumenten-Abnahme unten am 2026-08-23 gefunden hatte: `systemPromptHash` trennte auf
vault-rags Chat-Pfad keine Prompt-Fassungen, sondern Aufrufe. Gegen den alten Code ergaben
zwei Fragen an denselben unveraenderten Prompt zwei verschiedene Hashes (`43b854f4` /
`93712a00`). Die Abnahme dafuer: **zwei Chat-Fragen mit unterschiedlichem Retrieval-Kontext
stellen und pruefen, ob beide Records denselben Hash tragen.**

Gefahren im Vault `llm-lab`, beide Plugins frisch geladen, ueber die echte Oberflaeche
(Eingabefeld tippen, auf Kontext-Chips warten, senden — wie in `smoke:e2e`):

- **Chat, Frage A** ("Fasse zusammen, was in 'Latency and first token' steht.") →
  `promptTemplateHash: "ee498b56"`. Kontext: 5 Notizen, System-Nachricht über 2.000 Zeichen
  inkl. aller fuenf Notizinhalte.
- **Chat, Frage B**, in derselben Konversation weitergefragt ("Was sagt 'Keeping recordings
  small' zur Trace-Groesse?") → `promptTemplateHash: "ee498b56"` — **identisch zu A**,
  obwohl die tatsaechliche System-Nachricht laenger ist (traegt jetzt zusaetzlich Frage A
  und die Antwort darauf) und die zweite Nutzerfrage komplett anders lautet.
- **`reformat:freetext`, Anweisung A** ("Fasse das in einem Satz auf Englisch zusammen.") →
  `promptTemplateHash: "55d55d47"`.
- **`reformat:freetext`, Anweisung B** ("Formuliere das als Frage um.") →
  `promptTemplateHash: "55d55d47"` — **identisch zu A**, trotz komplett anderer Anweisung
  im System-Prompt (die Anweisung selbst steht wörtlich in der System-Nachricht, `def.
  promptTemplate()` liefert fuer `freetext` aber nur die feste Basis-Instruktion, nicht die
  Anweisung).

**Ergebnis: das Vorhaben erreicht sein Ziel.** Der Hash bleibt je Feature stabil, unabhaengig
von Retrieval-Kontext, Konversationsverlauf und (bei `freetext`) der Nutzer-Anweisung —
genau die Eigenschaft, die `systemPromptHash` auf demselben Pfad nicht hatte. Die beiden
Feature-Hashes (`chat` vs. `reformat:freetext`) unterscheiden sich voneinander, wie erwartet
(verschiedene Templates) — verglichen wird nur INNERHALB eines Features.

**Treiber-Falle dabei, dieselbe wie oben:** der erste Versuch dieser Messung schrieb ueberhaupt
keine Trace-Zeilen — nicht weil `shouldLog` sie verwarf, sondern weil der vorangegangene
`smoke:e2e`-Lauf im selben Fenster `api.log` bereits mit einer toten Closure ueberschrieben
hatte (s. oben). Nach dem Neuladen beider Plugins lief die Messung sauber.

## GUI-Smoke vault-rag (Staging-Vault `vault-rag`, separat vom Vault `llm-lab`) — 2026-08-30

`npm run smoke:gui -- --vault vault-rag` in vault-rag selbst, gegen `1df2cd1` (deployt).
**25/30 gruen.** Fuenf rote Punkte, zwei davon sind der bekannte, dokumentierte
Deckungsluecken-Fund dieser Fixture (nur je EIN Endpunkt konfiguriert — "Zeile 2 traegt den
Prioritaets-Knopf", "Klick setzt die Zeile an die Spitze"), **kein Rueckschritt.**

**Die anderen drei sind neu und ein Treiber-/Umgebungs-Befund, keine Produktregression:**
"Embedding: genau eine Zeile als aktiv markiert" (0 von 1), "Chat: genau eine Zeile als aktiv
markiert" (0 von 1) und "Alle Zustandstexte sind bekannte Formulierungen" (`"active",
"active"`) schlagen fehl, weil `scripts/gui-smoke.ts` die Zustandstexte hart gegen deutsche
Literale prueft (`aktiv`, `nicht erreichbar`, `pruefe…`, …), die Obsidian-Instanz in diesem
Lauf aber mit Oberflaeche **en** lief (`localStorage.getItem("language") === "en"`,
`moment.locale() === "en"` — gemessen per CDP direkt am Fenster) und deshalb "active" statt
"aktiv" rendert. Dieselbe Instanz zeigte auch fuer den Vault `llm-lab` "Oberflaeche en"
(s. Tabelle oben) — die Sprache ist eine Eigenschaft des **laufenden Obsidian-Prozesses**,
nicht des einzelnen Vaults, und acht Vault-Fenster liefen zum Zeitpunkt dieses Laufs
gleichzeitig in derselben Instanz (mehrere parallele Sessions). Die Sprache selbst zu
korrigieren wurde bewusst unterlassen, um laufende Messungen anderer Sessions am selben
Port nicht zu stoeren. Betroffen ist ausschliesslich das Rendering der Endpunkt-Zustandszeile
in vault-rags eigenem UI-Code (`i18n`-Text) plus die Haertung des dortigen Treibers gegen
Nicht-Deutsch — beides liegt ausserhalb dieser Task (keine Aenderung an vault-rag-Code, nur
gemessen und eingeordnet). Mit deutscher Oberflaeche waeren nach dieser Diagnose 27/30 zu
erwarten (die zwei Endpunkt-Luecken bleiben bestehen).

Ein separat gefahrener Direktvergleich der zugrundeliegenden Such-Funktion (`api.search()`
sechsmal einzeln statt gebuendelt in einer CDP-Runde) bestaetigt, dass die Retrieval-Logik
selbst intakt ist: **6/6 Notizen finden sich ueber ihren eigenen Wortlaut** (Rang 0) — genau
der Wert, den der reguläre Lauf oben auch zeigt. Der erste Versuch des GUI-Smoke war an
diesem Punkt in ein hartes `Runtime.evaluate`-Timeout (30 s) gelaufen, weil das dort
konfigurierte Embedding-Modell (`qwen3-embedding:8b`) beim ersten (kalten) Aufruf in dieser
Session mehrere Sekunden pro Embedding brauchte und der Pruefpunkt bis zu sechs solcher
Aufrufe in einer einzigen CDP-Runde buendelt (6× > 30 s); nach dem Aufwaermen (Modell im
Speicher) lag derselbe Aufruf bei 150-190 ms und der volle Lauf kam durch. Reiner
Kaltstart-/Timeout-Effekt der Umgebung, keine Code-Aenderung noetig oder vorgenommen.

## Konsumenten-Abnahme (Handover-Schritte 6, 8, 9, 10, 11)

Am 2026-08-23 einmalig von Hand gegen den echten Konsumenten gefahren — `vault-rag`
(Branch `feat/llm-lab-consumer`, 0.25.0) im selben Vault, LM Studio als Chat-Endpunkt
(CORS aktiv, aus dem Renderer gemessen), Ollama `qwen3-embedding:8b` für den Index
(5 Notizen). Nicht automatisiert: die Prüfpunkte gehören dem Konsumenten und damit in
`vault-rag/scripts/gui-smoke.ts`, nicht hierher. Als Task dort abgelegt.

⚠️ **Der Prüf-Vault trägt `vault-retrieval` nur so lange, bis jemand `--setup` fährt.** Das
Fixture aktiviert bewusst **nur** `llm-lab` (sonst malen fremde Plugins in jede Messung und in
jedes spätere Bild). Wer die Konsumenten-Schritte wiederholen will, deployt vault-rag erneut in
`~/StagingVaults/llm-lab/.obsidian/plugins/vault-retrieval/` und aktiviert es im laufenden
Obsidian — `app.plugins.loadManifests()` **vor** `enablePlugin`, sonst schlägt das Aktivieren
ohne Fehlermeldung fehl (Obsidian liest die Manifeste beim Start). Ebenso wirkt
`smartApplyEnabled` erst nach einem Plugin-Reload — das Panel wird beim Laden aufgebaut.

| Schritt | Ergebnis |
|---|---|
| 6 · Chat | 🟢 eine Zeile `plugin: vault-retrieval`, `feature: chat`, `model`, `endpointHost: localhost:1234`, `latencyMs 38673`, `ttftMs 7489`, `finishReason: stop` |
| 8 · Umformatieren (LLM) | 🟢 `feature: reformat:to-list`, 8,8 s, `finishReason: stop` — die Notiz blieb unverändert, das Vorschau-Modal wurde ohne Anwenden geschlossen |
| 9 · Smart Apply | 🟢 `feature: smart-apply`, 105,9 s — und die Zeile erklärt den Lauf besser als das Panel, s. unten |
| 10 · Endpunkt-Testknopf | 🟢 der Lauf fand statt (Notice „Thinking wird unterdrückt"), **keine** Zeile — `settings-probe` steht ab Werk in der Ausschlussliste |
| 11 · Lab deaktiviert | 🟢 Chat lief vollständig durch (Sende-Knopf zurück auf „Senden"), Antwort korrekt, keine Notice, **keine** Zeile |

**Ein Abbruch wird als solcher aufgezeichnet** (Nebenbefund): ein per „Stop" abgebrochener
Chat erzeugte eine Zeile mit `error: "Aborted"`, `ttftMs 2060`, `latencyMs 439980` — und
`response.content: ""`. Der bis zum Abbruch gestreamte Text geht dabei verloren; das ist
eine Eigenschaft des Konsumenten (`chat_client.ts` meldet im `catch` `content: ""`), nicht
des Labs, und für die Fehlersuche wäre der Teiltext der interessantere Teil.

**Der Smart-Apply-Lauf ist der beste Beleg dafür, wofür das Lab da ist.** Das Panel zeigte
keinen Fehler und kein Ergebnis. Die Trace-Zeile sagt, warum: `reasoning` 14.083 Zeichen,
`content` **leer**, `finishReason: "length"`, kein `ttftMs`. Das Modell hat das gesamte
Token-Budget (`smartApplyMaxTokens: 4096`) im Denken verbraucht und nie eine Antwort
begonnen — bei eingeschaltetem Thinking teilen sich Denken und Antwort dieses Budget. Ohne
Aufzeichnung wäre die Beobachtung „Smart Apply hat nichts gemacht" gewesen. Das ist ein
Befund am Konsumenten, nicht am Lab; er gehört in **vault-rags** Cockpit und ist dort
abgelegt.

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

**Es hängt am Pfad, nicht am Konsumenten** — dieselbe Abnahme liefert die Gegenprobe: Smart
Apply schickt einen System-Prompt ohne Retrieval-Kontext (958 Zeichen), dort ist der Hash
stabil und tut genau das, was `record.ts` verspricht. Ein Feld, das je nach aufrufendem
Feature etwas anderes bedeutet, ist deshalb das Problem — nicht ein kaputter Hash.

**Aufgelöst mit `apiVersion` 3 (2026-08-30).** Der Konsument meldet den stabilen Prompt-Anteil
als `promptTemplate`; daraus entsteht `promptTemplateHash`. Ohne Meldung entsteht kein Hash —
bewusst kein Rückfall auf die ganze System-Nachricht, weil ein mehrdeutiges Feld schlimmer ist
als ein fehlendes. Die Nachmessung beim Entwurf fand einen zweiten Fall, den diese Abnahme
übersehen hatte: `reformat:freetext` trägt die Nutzer-Anweisung im System-Prompt und war
ebenso instabil — die Abnahme hatte `reformat:to-list` gefahren, das stabil ist.
