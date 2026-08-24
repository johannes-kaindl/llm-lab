# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.
Workspace-weite Standards (comply-or-explain): siehe [`../_docs/CONVENTIONS.md`](../_docs/CONVENTIONS.md)
(maintainer-lokal, im Klon ggf. nicht vorhanden — dann ignorieren).

**Profil:** `ts-node` · `obsidian-plugin`.

**Stand 2026-08-23: Slice 1 gebaut, 0.1.0 und 0.2.0 released, beide Forges öffentlich, Store-
Einreichung steht aus (Developer Dashboard, Maintainer-Login). Die Vertragserweiterung
(`apiVersion` 2 — `secrets`/`contextPaths`, Ordner-Filter) ist gebaut und liegt unter
`[Unreleased]`, noch nicht released.** Für neue Vorhaben gilt: erst
Kit-first-Sondierung (`../AGENTS.md` + `../REGISTRY.md`), dann `superpowers:brainstorming` →
Spec → Plan → TDD.

## Project character

**Projekt:** `llm-lab` (manifest-`id` = Repo-Slug) — Obsidian-Plugin, das **anderen**
Obsidian-Plugins eine Aufzeichnungs-API anbietet: jeder LLM-Aufruf, den ein Nachbarplugin
macht, kann mit einer Zeile protokolliert werden (Modell, volle Nachrichtenliste, Antwort,
Latenz, Fehler/Abbruch). Aus den Aufzeichnungen entsteht später (nicht in Slice 1) ein
bewerteter Datensatz für Auswertung und Fine-Tuning. Autor: Johannes Kaindl.

**Warum es existiert:** Vier Plugins im Workspace sprechen mit lokalen LLMs (`vault-rag`,
`koda-agent`, `vault-crews`, `obsidian-transmute`) — über die Qualität dieser Aufrufe existieren
**keine Daten**. Ist Modell B besser als Modell A für ein Feature? Hat eine Prompt-Änderung
geholfen oder geschadet? Heute wird das geraten. LLM Lab ist die laufende Erhebung dafür,
**als eigenes Plugin**, nicht als Kit-Modul oder Feature in einem der vier: ein Protokoll von
LLM-Interaktionen ist eine Fähigkeit, die niemand stillschweigend in einem Retrieval- oder
Chat-Plugin haben will — „nicht installiert" ist eine stärkere Zusage als jeder
Settings-Schalter, und der Wert entsteht gerade durch den Vergleich über Plugins hinweg.

**Nicht-Ziele (Slice-1-Grenzen):** kein eigener LLM-Client, kein Netzwerkzugriff, keine
Bewertungs-Oberfläche, kein Export, keine Statistik-Auswertung. LLM Lab ruft nie selbst ein
Modell auf — es zeichnet nur auf, was ein anderes Plugin bereits gesendet und empfangen hat.

## Architektur: Anbieter, nicht Konsument

`llm-lab` ist **Anbieter**, andere Plugins sind **Konsumenten** — dieselbe Bauart wie
`vault-rag/src/plugin_api.ts` (Anbieter) und `koda-agent/src/obsidian/retrieval.ts`
(defensiver Konsument), nur mit vertauschten Rollen:

```
llm-lab                                vault-rag / koda-agent / vault-crews / obsidian-transmute
  plugin.api ─────────────────────────► app.plugins.plugins["llm-lab"]?.api?.log(record)
  { apiVersion: 2, status(), log() }
```

Nicht verhandelbare Eigenschaften:

- **Kein Lab installiert → passiert nichts.** Der Zugriff ist ein Objekt-Lookup, der `null`
  liefert; ein Konsument liest ihn defensiv und bricht nie, wenn LLM Lab fehlt. Die
  Opt-in-Zusage ist damit technisch durchgesetzt, nicht versprochen.
- **`log()` ist fire-and-forget — der Rückgabetyp ist `string`, nicht `Promise<string>`.**
  Telemetrie darf einen laufenden Chat-Stream oder Reformat-Lauf niemals ausbremsen oder
  abbrechen. Die Signatur ist deshalb bewusst synchron: `log(input)` vergibt die id sofort
  und schreibt intern asynchron (`TraceStore.write` ruft `void this.writeNow(...)`, nie
  `await`et). Ein `Promise<string>` zwänge jeden Konsumenten, der die id für einen späteren
  Bewertungsknopf braucht, zu einem `await` mitten im Antwortpfad — genau die Kopplung, die
  diese Regel ausschließen soll.
- **Kein DOM über die Plugin-Grenze.** `plugin_api.ts` reicht Daten durch, nie Obsidian- oder
  DOM-Objekte. Ein Fremdplugin, das in ein fremdes Panel rendert, koppelt an Layout und CSS;
  eines, das eine id entgegennimmt, koppelt an eine Signatur.
- **`apiVersion` ist der Vertrag, nicht der Compiler.** Zwei eigenständige Repos (PROF-OBS-09)
  dürfen kein Build-Coupling eingehen — ein Konsument kopiert die Form (`LabLogInput`),
  importiert sie nie, und prüft `apiVersion` gegen seine eigene Konstante, bevor er sich auf
  die Form verlässt. **Sie steht seit 2026-08-23 auf `2`** (`LLM_LAB_API_VERSION`,
  `plugin_api.ts`): `LabLogInput` trägt jetzt zusätzlich die beiden optionalen Steuerfelder
  `secrets?: string[]` und `contextPaths?: string[]`. Der Bump ist die erste gemessene
  Anwendung dieser Regel im Workspace — ein Konsument, der strikt auf `1` prüft, schweigt
  bis zu seinem Nachzug, und genau das soll er tun. Der Preis ist ein koordiniertes
  Doppel-Release in fester Reihenfolge: **Anbieter zuerst, Konsument danach.**

### Verhältnis zum Kit

- **`redactSecrets`/`redactRecordSecrets`** (`src/core/redact_secrets.ts`) ist **übernommen aus
  `vault-crews/src/core/redact.ts`, 2026-08-22** (Herkunftsstempel in der ersten Zeile) — 2.
  Exemplar dieser Lösung, s. `../REGISTRY.md`. Geändert gegenüber der Vorlage: nimmt eine
  Schlüsselliste (`string[]`) statt `EndpointConfig[]` entgegen — LLM Lab kennt die
  Endpunkt-Typen seiner Konsumenten nicht und soll sie nicht kennen.
- **Der REGISTRY-Kandidat `TraceStore`** (`neurovim-standalone`) wird **nicht** eingelöst: 23
  Zeilen ohne Rotation, ohne Schema, ohne Redaktion. Was hier entsteht, ist reicher und bleibt
  zunächst im Lab, nicht im Kit. Der Kandidaten-Eintrag bleibt offen.
- **Der i18n-Modul-Ebenen-Wächter** (`tests/i18n/keys.test.ts`) unterscheidet sich von der
  Fassung in `vault-rag/tests/i18n/keys.test.ts` in genau einem Punkt: `vault-rag`s
  `isFunctionOpener` behandelt `class Foo {` als Funktions-/Methodenkopf und stellt damit den
  **gesamten** Klassenkörper zurück — ein Klassenfeld direkt im Körper (`label = t("x")`, ohne
  `const`/`let`/`var`) rutscht dort durch. Diese Fassung erkennt Klassenkörper separat von
  Methodenkörpern und fängt das Feld. **Keine anderen Unterschiede:** `vault-rag`s Wächter
  trackt bereits Klammer-Tiefe statt nur `const NAME = t(...)` zu matchen und erkennt
  `let`/`var`-Deklarationen und `export default { … t(...) }` auf Modul-Ebene genauso wie
  dieser hier (durch Ausführung verifiziert, Review 2026-08-22 — eine frühere Fassung dieser
  Zeile behauptete das Gegenteil und war falsch). Rückportier-Kandidat für `vault-rag` ist
  daher nur die Klassenfeld-Erkennung, s. eigener REGISTRY-Eintrag.

## Datenmodell — zwei Schichten, eine Bewegung

```
<plugin-config-dir>/llm-lab/
  traces/YYYY-MM-DD.jsonl   flüchtig · roh · rotiert (Tage + harte MB-Grenze)
  dataset.jsonl             bleibend · redigiert · nur Bewertetes — NICHT Teil von Slice 1
```

Der **Trace** ist die flüchtige Rohschicht: append-only, eine Zeile je Aufruf, rotiert nach
Alter und Gesamtgröße (heutige Datei nie gelöscht — sie ist die, in die gerade geschrieben
wird). Der **Datensatz** ist die bleibende, redigierte Schicht: nur was ein Mensch bewertet,
wird dorthin **kopiert** (nicht referenziert) — ein Trace verfällt mit der Rotation, ein
kopierter Datensatz-Eintrag überlebt sie. Eine Referenz zeigte nach sieben Tagen ins Leere.

**Slice 1 baut nur die Trace-Schicht.** `TraceRecord`/`TraceStore`/`planRotation` sind fertig
und getestet; `dataset.jsonl`, das Kopieren beim Bewerten und jede Bewertungs-Oberfläche
existieren als Datenmodell-Absicht in dieser Datei, nicht als Code. Wer eine
Bewertungs-Fähigkeit baut, findet hier die Entscheidung, aber keinen Anfang zum Erweitern.

## Redaktion: zwei Läufe, eine feste Reihenfolge

Zwei Maskierungsläufe, **niemals in der anderen Reihenfolge**:

1. **Schlüssel-Maskierung (`redactRecordSecrets`) LÄUFT IMMER, ohne Einstellung — und hat
   seit `apiVersion` 2 auch etwas zu vergleichen.** Der exakte-String-Ersetzungslauf
   bekommt die **Vereinigung** zweier Listen: `deps.secrets()` (die Lab-eigene Liste — sie
   ist weiterhin leer, `main.ts` verdrahtet unverändert `secrets: () => []`, und sie ist die
   Stelle, an der später eine im Lab konfigurierte Liste andockt) und `input.secrets` (die
   Schlüssel, die der Konsument bei DIESEM Aufruf mitgibt). `log()` trennt das Feld explizit
   heraus, bevor `buildTraceRecord` läuft — ein Schlüssel wird nur zum Maskieren benutzt und
   wandert nie in den Record. Zusätzlich greift weiterhin das fest einprogrammierte
   `BEARER`-Muster auf Token, die wörtlich in `Bearer <token>`-Form im Text auftauchen.
   **Die Zusage bleibt trotzdem an eine Bedingung geknüpft:** ein Konsument, der `secrets`
   nicht befüllt, bekommt genau wie vorher nur das `BEARER`-Muster — der Mechanismus läuft
   unbedingt, das Ergebnis hängt am Aufrufer. API-Schlüssel und Bearer-Echos sind kein Inhalt
   und kein Zweck der Erhebung — sie gehören in keine der beiden Schichten, roh oder
   redigiert; das ist die Begründung dafür, WARUM diese Maskierung unbedingt läuft.
2. **PII-Redaktion (`redactPii`) läuft NUR über die Textfelder** (`messages[].content`,
   `response.content`, `response.reasoning`, `error`) und **nur wenn `redactPiiInTrace`
   gesetzt ist** (Default: aus). PII *ist* der Inhalt und damit der Zweck der Erhebung — das
   Debugging einer schlechten Antwort braucht, was wirklich gesendet wurde. Die Asymmetrie
   zu Punkt 1 ist beabsichtigt und hier dokumentiert, sonst hält sie später jemand für eine
   Lücke und „repariert" sie in die falsche Richtung.

**Warum genau diese Reihenfolge und keine andere:** `redactPii`s `PHONE`-Muster ist ein
blanker Ziffernlauf und trifft dabei auch die Ziffernfolge INNERHALB eines API-Schlüssels.
Liefe die PII-Redaktion zuerst, zerrisse sie den Schlüssel in Fragmente — die anschließende
exakte String-Suche der Schlüssel-Maskierung fände das Original-Literal danach nicht mehr,
und die Fragmente landeten ungeschwärzt auf der Platte. Umgekehrt ist unbedenklich: eine
Muster-Ersetzung zerreißt nichts, was noch geschwärzt werden müsste — nichts, was die
Schlüssel-Maskierung erzeugt (`••••`, `Bearer ••••`), matcht EMAIL/IBAN/PHONE/URLCRED. Die
Regel dahinter: **wer exakt matcht, muss laufen, bevor wer Muster umschreibt.**

**Was die erste Abnahme gegen einen echten Konsumenten über das Feldset ergeben hat:**
`systemPromptHash` trennt auf vault-rags Chat-Pfad **keine Prompt-Fassungen, sondern Aufrufe** —
der Retrieval-Kontext steckt dort in der System-Nachricht, also ändert sich der Hash mit jeder
Frage (gemessen 2026-08-23: zwei Fragen an denselben unveränderten Prompt ergaben zwei Hashes).
Der Code tut, was `record.ts` sagt; die dokumentierte *Absicht* („zwei Prompt-Fassungen
unterscheidbar machen") trägt auf diesem Pfad nicht. Wer die Bewertungs-Schicht baut, braucht
einen Hash über den stabilen Prompt-Anteil oder ein eigenes Feld — Details und Messwerte in
`docs/SMOKE.md` § Konsumenten-Abnahme.

`TraceStore.writeNow` (`src/core/trace_store.ts`) ist die einzige Stelle, an der beide Läufe
zusammengeführt werden — genau in dieser Reihenfolge, mit einem Kommentar-Block, der sie
begründet, damit ein künftiger Refactor sie nicht aus Versehen vertauscht.

**Die PII-Redaktion ist record-weit konsistent, nicht feldweise.** Der Platzhalter-Zähler
(`Map<string, string>` je Muster-Label) wird EINMAL pro Record aufgebaut und über
`messages[]`, `response.content`, `response.reasoning` und `error` hinweg geteilt — dieselbe
Adresse bekommt in Prompt UND Antwort denselben Platzhalter. Eine feldweise Zählung würde bei
jedem Feld neu bei `_1` anfangen; ein aus solchen Daten trainiertes Modell lernt daraus, aus
einem Platzhalter beliebige neue Daten zu erfinden, statt die Aufgabenstruktur zu lernen. Das
ist die eigentliche Referenzleistung dieses Moduls (`src/core/redact_pii.ts`) — s. REGISTRY.

## Kein UI über die Einstellungen hinaus

**Slice 1 verzichtet bewusst auf jede Oberfläche außer dem Settings-Tab.** Kein
Bewertungs-Knopf, kein Datensatz-Browser, kein Export-Dialog — alle drei setzen eine
Datensatz-Schicht voraus, die in dieser Slice nicht existiert (s. Datenmodell oben). Der
Status wird ausschließlich über die Statusleiste (Icon + Text, nie Farbe allein — WCAG 1.4.1)
und einen Command (`toggle-pause`) sichtbar. Wer eine UI für Slice 2 baut, prüft zuerst
`../UI-STANDARD.md`.

## Bekannte Lücken in Slice 1 — beide geschlossen (2026-08-23)

Slice 1 führte hier zwei offene Lücken: Endpunkt-Schlüssel wurden nicht durch exakte
Übereinstimmung maskiert, und eine Ordner-/Pfad-Ausschlussliste gab es überhaupt nicht.
**Beide sind mit der Vertragserweiterung (`apiVersion` 1 → 2, 2026-08-23) geschlossen.** Der
Abschnitt bleibt stehen, weil die Begründung, warum sie in Slice 1 offen blieben, weiter
Erklärwert hat — und weil beide Zusagen eine benannte Bedingung behalten.

**Warum sie überhaupt offen blieben:** beides ließ sich nur über den **öffentlichen
API-Vertrag** schließen, und der war zum Zeitpunkt des Befundes bereits abgenommen — samt der
Konsumenten-Verdrahtung in `vault-rag`. Ein Vertrags-Umbau ist kein Dokumentationsfix; er
wurde deshalb bewusst als eigenes Vorhaben mit eigenem Versionsbump und koordiniertem
Doppel-Release geführt statt nachträglich in eine abgenommene Slice gepatcht.

**Lücke 1 — Schlüssel-Maskierung — geschlossen über `LabLogInput.secrets`.** Ein Konsument
gibt seine Endpunkt-Schlüssel pro Aufruf mit; `log()` trennt das Feld heraus, bevor der Record
gebaut wird (der Schlüssel ist Steuerdatum, nie Record-Inhalt), und **vereinigt** es mit
`deps.secrets()`. **Wichtig gegen ein naheliegendes Missverständnis: das Lab hat weiterhin
KEINE eigene Schlüsselliste** — `main.ts` verdrahtet unverändert `secrets: () => []`.
Geschlossen ist die Lücke, weil der Aufrufer seine Schlüssel jetzt mitgeben kann, nicht weil
das Lab sie kennt. Der Satz **„Mechanismus läuft unbedingt ≠ Ergebnis ist garantiert"** gilt
damit weiter, nur anders aufgelöst: er hing vorher an einer Lücke im Vertrag, jetzt hängt er
am Aufrufer — ein Konsument, der `secrets` nicht befüllt, bekommt weiterhin nur das
`BEARER`-Muster (`redact_secrets.ts`), das einen Token trifft, der wörtlich in
`Bearer <token>`-Form im aufgezeichneten Text auftaucht.

**Lücke 2 — Ordner-Ausschluss — geschlossen über `LabLogInput.contextPaths` plus zwei
Einstellungen.** `excludedFolders` (Ordnerpfade, Präfix-Vergleich mit Ordnergrenze, damit
„Privat" nicht auch „Privates.md" schluckt) und `strictFolderExclusion` (Default `true`: EIN
ausgeschlossener Pfad verhindert den Record; `false`: nur wenn ALLE beteiligten Notizen
ausgeschlossen sind). Die Entscheidung liegt in `pathsExcluded(paths, settings)` und wird von
`shouldLog(input, paused, settings)` kurzschließend mitgeführt (`enabled` → `paused` →
`feature` → Pfade) — ein ausgeschlossener Pfad verhindert, dass ein Record überhaupt entsteht.
**Die Zusage hat eine benannte Grenze, und sie ist gewollt: der Filter greift nur bei Aufrufen,
deren Plugin `contextPaths` meldet — fail-open.** Fail-closed hieße: sobald ein Ordner
ausgeschlossen ist, verstummt jeder Konsument, der noch keine Pfade liefert. Der Preis ist
eine Zusage mit Bedingung, und weil das eine Nutzer-Zusage ist, steht die Bedingung im
Settings-Tab (dritte `render`-Hatch, „Was der Ordner-Filter sieht und was nicht") und in
beiden READMEs — nicht nur hier.

## Modul-Layout (`src/`)

```
core/
  types.ts          TraceRecord — das Feldset, das auf die Platte geschrieben wird.
  record.ts         TraceInput → TraceRecord: hashPrompt (FNV-1a, kein Krypto-Anspruch — nur
                    unterscheidbar, nicht geheim) · hostOf (Host+Port aus einer URL, faellt
                    auf "unbekannt" zurueck statt zu werfen) · buildTraceRecord.
  redact_secrets.ts redactSecrets/redactRecordSecrets — Schlüssel-Maskierung, Lauf ist
                    unbedingt; die Liste ist die Vereinigung aus deps.secrets() (leer) und
                    den Aufruf-Schlüsseln (LabLogInput.secrets). Ohne Aufruf-Schlüssel wirkt
                    nur das BEARER-Muster — s. „Bekannte Lücken in Slice 1 — beide geschlossen" oben.
  redact_pii.ts     redactPii — Muster-Maskierung mit record-weiten Platzhaltern, läuft nur
                    wenn redactPiiInTrace gesetzt ist (für den rohen Trace).
  rotation.ts       planRotation — reine Entscheidung, welche Trace-Dateien weg müssen
                    (Alter + Größengrenze, heutige Datei geschützt), `today` als Parameter
                    statt `Date` für Zeitreise-freie Tests.
  settings.ts       LabSettings · DEFAULT_SETTINGS · pathsExcluded(paths, settings) —
                    Ordner-Ausschluss (Präfix mit Ordnergrenze, fail-open ohne Pfade) ·
                    shouldLog(input: LogDecisionInput, paused, settings) — bündelt Feature-
                    UND Ordner-Ausschluss kurzschließend: enabled → paused → feature → Pfade.
  trace_store.ts    TraceStore — TraceSink-Port injiziert, write() fire-and-forget,
                    writeNow() awaitbar (nur für Tests), rotate() nach jedem Schreiben.
  i18n/strings.ts   EN/DE-Wörterbuch, importiert für den Registrierungs-Seiteneffekt.
obsidian/
  settings_tab.ts   LabSettingTab — ZWEIGLEISIG (seit 0.2.0): getSettingDefinitions() ist die
                    eine Struktur, get/setControlValue der Host, display() zeichnet dieselbe
                    Liste mit dem Kit-Walker nach (Obsidian < 1.13). Enthält die drei
                    inhaltlich verbindlichen Zeilen (Ablageort im Klartext, Grenzen der
                    Maskierung, Grenze des Ordner-Filters) — alle drei als `render`-Hatch,
                    s. unten.
  vault_sink.ts     vaultSink(adapter) — dünne Anpassung von Obsidians DataAdapter an
                    TraceSink; legt den Ordner beim ersten Schreiben an.
plugin_api.ts       createLlmLabApi — der öffentliche Vertrag (s. oben).
main.ts             Plugin-Entry: Sprache setzen, Settings laden, TraceStore/API verdrahten,
                    Statusleiste, toggle-pause-Command, Settings-Tab registrieren.
vendor/kit/i18n.ts          Verbatim-Snapshot aus obsidian-kit — nie von Hand editieren.
vendor/kit-obsidian/
  settings_walker.ts        Übernommen aus obsidian-kit@0.27.0 (Herkunftsstempel in Zeile 1),
                            17. Consumer des Musters. Einzige Abweichung: der `folder`-Zweig
                            ist entfernt (zieht FolderSuggest nach; der Ordner-Ausschluss ist
                            eine `textarea`, kein `folder`-Control).
                            Nie von Hand editieren — wächst der Bedarf, neu aus dem Kit ziehen.
```

**Zwei Regeln, die beim Anfassen des Settings-Tabs gelten** (beide gemessen, nicht vermutet):

1. **Eine Zeile ohne Regler braucht im deklarativen Modell trotzdem einen Renderer.** Eine
   reine name/desc-Definition überspringt der native 1.13-Renderer stillschweigend, während
   der Fallback-Walker sie zeichnet — die beiden Pfade zeigten dann Verschiedenes, und unter
   1.13 fiele es nie auf. Deshalb sind Ablageort, Maskierungs-Grenzen und die Grenze des
   Ordner-Filters `render`-Hatches. Prüfpunkt 23 im GUI-Smoke bewacht genau das.
2. **Die Wertprüfung gehört in `setControlValue`, nicht nur in `validate`.** `validate` wertet
   allein der native Renderer aus; der Kit-Walker kennt es nicht. Ohne die Wache im Host
   schriebe der Fallback-Pfad `NaN` in die Einstellungen (Prüfpunkt 25).

**`minAppVersion` musste dafür NICHT steigen** — sie steht weiter auf 1.8.7, der Fallback
bedient alles darunter. Die frühere Stundung dieses Umbaus („1.13-API, unsere Nutzer sind
darunter") war in genau diesem Punkt falsch.

`src/core/` importiert nirgends `obsidian` (`npm run check:pure` erzwingt das). Nur
`main.ts`, `obsidian/settings_tab.ts` und `obsidian/vault_sink.ts` tun das.

## Commands

```bash
npm install                       # Deps
npm run dev                       # esbuild watch
npm run build                     # tsc --noEmit + esbuild --production
npm run typecheck                 # tsc --noEmit
npm run typecheck:test            # tsc -p tsconfig.test.json --noEmit
npm run typecheck:scripts         # tsc -p tsconfig.scripts.json --noEmit (nur mit Dach-Checkout)
npm test                          # vitest run
npm run lint                      # check-no-inline-disables + eslint src --max-warnings 0
npm run check:pure                # scripts/check-pure.mjs — src/core darf obsidian nicht importieren
npm run gate                      # lint + typecheck + typecheck:test + typecheck:scripts + test + check:pure + build
OBSIDIAN_PLUGIN_DIR=… npm run deploy   # build + main.js/manifest.json/styles.css ins Vault-Plugin-Verzeichnis
STAGING_VAULTS_DIR=… npm run smoke:gui -- --setup         # Pruef-Vault aus docs/images/fixture/ bauen
STAGING_VAULTS_DIR=… npm run smoke:gui -- --vault llm-lab # 28 Pruefpunkte gegen ein laufendes Obsidian
npm run version-bump / preflight / release   # delegieren ans zentrale ../tools/release/ (Dach)
```

## Conventions

- **TS strict + `noImplicitAny`** — keine `any`-Casts für neue Typen.
- **TDD** (`superpowers:test-driven-development`): der reine Kern wird test-first gebaut.
- **Tests:** vitest, Node-Umgebung — `src/core/` braucht keinen DOM-Mock, weil es kein DOM
  berührt. Nach jeder Änderung müssen alle Tests grün bleiben.
- **GUI-Smoke (CORE-TEST-02 b):** `scripts/gui-smoke.ts` prüft gegen ein **laufendes**
  Obsidian, was gegen einen Mock strukturell nicht prüfbar ist — allen voran den Datei-Weg
  (`vault_sink.ts`) und die Rotation, die daran hängt, dass `adapter.stat()` unter
  `.obsidian/` eine Größe liefert. Prüfpunkte, Aufruf und Durchlauf-Vermerke stehen in
  `docs/SMOKE.md`; die CDP-Brücke kommt zentral aus `../tools/obsidian-cdp/` und wird
  importiert, nie vendored. Wer `vault_sink.ts`, `rotation.ts`, `main.ts::renderStatus` oder
  die Zeilen-Reihenfolge im Settings-Tab anfasst, fährt ihn — dort misst keine vitest-Suite mit.
- **i18n:** nutzersichtbare Strings via `t()` (`src/vendor/kit/i18n.ts`), EN kanonisch + DE.
  **Nie ein `t()`-Aufruf auf Modul-Ebene oder in einem Klassenfeld** — `setLang()` läuft in
  `onload`, nach der Modul-Auswertung; ein `t()` davor friert die Sprache still auf den
  Default ein. `tests/i18n/keys.test.ts` ist der (verbreiterte) Wächter dafür.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien
  stagen — nie `git add -A`.** Trailer bei substanziellem AI-Beitrag:
  `Co-Authored-By: Claude Opus <Version> (1M context) <noreply@anthropic.com>`.

## Gotchas

- **`log()` gibt die id SYNCHRON zurück, obwohl `TraceStore.write` intern async schreibt.**
  Das ist kein Rennen: die id wird VOR dem Schreiben vergeben (`deps.newId()` in
  `plugin_api.ts`), der Schreibvorgang selbst läuft danach fire-and-forget. Ein Konsument, der
  die id für einen späteren Bewertungsknopf braucht, bekommt sie also garantiert, auch wenn
  der zugehörige Trace erst Millisekunden später tatsächlich auf der Platte steht.
- **`shouldLog(input: LogDecisionInput, paused, settings)` nimmt seit `apiVersion` 2 ein
  Objekt (`{ feature, contextPaths? }`), keinen Feature-String mehr** — Feature- und
  Ordner-Ausschluss stehen bewusst in EINER Funktion. Zwei getrennte, die jeder Aufrufer
  selbst kombinieren muss, sind die Fehlerklasse, bei der eine Schicht später vergessen wird.
  Ausgewertet wird kurzschließend in dieser Reihenfolge: `enabled` → `paused` → `feature` →
  Pfade. Dass `paused` dabei ignoriert wird, wenn `settings.enabled` schon `false` ist, macht
  die beiden Bedingungen nicht gleich: `enabled` ist persistiert, `paused` ist Sitzungszustand
  und wird bewusst NICHT persistiert (eine Pause soll beim nächsten Start von selbst enden).
  Der Pfad-Schritt ist **fail-open**: ohne `contextPaths` greift er nicht (s. „Bekannte Lücken
  in Slice 1 — beide geschlossen" oben).
- **`redactRecordSecrets`/`redactPii` arbeiten über die Serialisierung** (`JSON.stringify`/
  `JSON.parse` bzw. Feld-für-Feld-Rekonstruktion), nicht über eine Liste zu pflegender Felder
  — eine Feldliste wäre genau die Buchhaltung, die beim nächsten neuen `TraceRecord`-Feld
  still veraltet. `redactRecordSecrets` wirft dementsprechend auf nicht-serialisierbarem
  Input; das ist beabsichtigt und fail-closed (`TraceStore.writeNow` fängt den Fehler, sodass
  nie ein Geheimnis ungeschwärzt geschrieben wird).
- **`vaultSink.list` liefert eine leere Liste, wenn der Ordner noch nicht existiert** (statt zu
  werfen) — `planRotation` bekommt dann `[]` und tut nichts, was für den allerersten Schreib-
  vorgang korrekt ist (kein Ordner, keine Dateien zum Rotieren).
- **`data.json`** ist die von Obsidian persistierte Plugin-Konfig (`saveData`) — git-ignored.
- **`main.js`** ist Build-Artefakt (gitignored) — nie von Hand editieren.
- **`styles.css` existiert, ist absichtlich leer.** Slice 1 hat keine eigene CSS-Klasse (nur
  native `Setting`-Zeilen und ein Statusleisten-Icon über `setIcon`) — die Datei liegt trotzdem
  im Repo-Root und ist getrackt, mit einem Kommentar, der genau das erklärt. Grund: `npm run
  deploy` und `.github/workflows/release.yml` behandeln `styles.css` als Pflicht-Asset
  (kanonische Vorlage); ohne die Datei würde beides brechen. Braucht eine spätere Slice
  eigenes UI-CSS, wird diese Datei befüllt — nicht neu angelegt.

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter dem Koordinations-Dach `obsidian-plugins/` (Elternverzeichnis) und ist
ein **eigenständiges Git-Repo** (PROF-OBS-09: kein Monorepo, eigener Release-Takt, Kit per
git-Tag). **Vor dem Lösen eines Problems:** `../AGENTS.md` (Kit-first-Regel) und
`../REGISTRY.md` (Lösungs-Registry) prüfen. **Vor jeder UI-Arbeit:** `../UI-STANDARD.md`.

**Cockpit:** `$VAULT/25_Coding/llm-lab/` (Stand, Tasks, Session-Log — mnemetisches
Substrat/SSOT). **SDD-Artefakte (Spec/Plan) liegen dort unter `_SDD/`, nicht im Repo**
(CORE-META-14) — das Repo behält die verdichtete Design-Essenz hier und im CHANGELOG.
**Nie absolute Pfade außerhalb des Repos in Repo-Dateien** — Platzhalter (`$VAULT/…`) verwenden.
