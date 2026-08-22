# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.
Workspace-weite Standards (comply-or-explain): siehe [`../_docs/CONVENTIONS.md`](../_docs/CONVENTIONS.md)
(maintainer-lokal, im Klon ggf. nicht vorhanden — dann ignorieren).

**Profil:** `ts-node` · `obsidian-plugin`.

**Stand 2026-08-22: Slice 1 gebaut, Repo noch nicht released.** Für neue Vorhaben gilt: erst
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
  { apiVersion, status(), log() }
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
  die Form verlässt.

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

1. **Schlüssel-Maskierung (`redactRecordSecrets`) LÄUFT IMMER, ohne Einstellung — aber
   der Mechanismus läuft immer, das Ergebnis ist trotzdem meist wirkungslos.** Der
   exakte-String-Ersetzungslauf über die Schlüsselliste tut in Slice 1 nichts: `main.ts`
   verdrahtet `secrets: () => []` (eine permanent leere Liste), und `LabLogInput` hat KEIN
   Feld, über das ein aufrufendes Plugin einen Endpunkt-Schlüssel überhaupt übergeben könnte.
   Real wirksam ist nur das fest einprogrammierte `BEARER`-Muster, das einen Token trifft, der
   wörtlich in `Bearer <token>`-Form im aufgezeichneten Text auftaucht. **Das ist eine echte
   Lücke in Slice 1, keine Design-Entscheidung** — s. „Bekannte Lücken in Slice 1" unten.
   API-Schlüssel und Bearer-Echos sind kein Inhalt und kein Zweck der Erhebung — sie gehören
   in keine der beiden Schichten, roh oder redigiert; das bleibt die Begründung dafür, WARUM
   diese Maskierung unbedingt laufen soll, auch wenn sie es in Slice 1 nur teilweise tut.
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

## Bekannte Lücken in Slice 1

**Endpunkt-API-Schlüssel werden NICHT durch exakte Übereinstimmung maskiert — eine echte
Lücke, keine Design-Entscheidung.** Konkret, gegen den Code verifiziert (Review 2026-08-23):

- `main.ts` verdrahtet `createLlmLabApi` mit `secrets: () => []` — einer **permanent leeren**
  Liste. Das ist die einzige Stelle, an der die API überhaupt konstruiert wird.
- `LabLogInput` (`plugin_api.ts`) hat **kein Feld**, über das ein aufrufendes Nachbarplugin
  seinen eigenen Endpunkt-Schlüssel an `log()` durchreichen könnte.
- Damit läuft `redactRecordSecrets(record, [])` bei jedem Schreibvorgang — der Mechanismus
  läuft unbedingt, wie dokumentiert —, aber seine exakte-String-Ersetzungsschleife hat nichts
  zum Vergleichen und tut nichts. **Mechanismus läuft unbedingt ≠ Ergebnis ist garantiert.**
  Real wirksam bleibt nur das fest einprogrammierte `BEARER`-Muster (`redact_secrets.ts`), das
  einen Token trifft, der wörtlich in `Bearer <token>`-Form im aufgezeichneten Text auftaucht
  — z.B. weil ein Konsument ihn versehentlich in eine Fehlermeldung oder einen Header-Echo im
  `content`-Feld einbettet.

**Was das schließen würde, bewusst NICHT in dieser Session angegangen:** ein `secrets`- oder
`apiKeys`-Feld auf `LabLogInput`, das ein Konsument befüllt, plus die entsprechende
Verdrahtung in `main.ts` und in jedem Konsumenten (aktuell `vault-rag`). Das ist eine Änderung
am öffentlichen API-Vertrag (Task 8) und an bereits abgenommener Konsumenten-Verdrahtung
(Task 10) — ein Vertrags-Umbau, kein Dokumentationsfix, und deshalb bewusst als Folge-Arbeit
für die nächste Slice vorgemerkt statt hier nachträglich hineingepatcht.

**Zweite echte Lücke, derselben Bauart: es gibt KEINE Ordner-/Pfad-Ausschlussliste.**
`shouldLog(feature, paused, settings)` (`settings.ts`) prüft ausschließlich `feature` gegen
`excludedFeatures` — es gibt keinen zweiten Parameter und keinen Vergleich gegen einen Pfad.
`LabLogInput`/`TraceInput` (`plugin_api.ts`/`record.ts`) haben kein Pfad-Feld, und `log()`
reicht folglich nie einen Pfad an `shouldLog` oder `buildTraceRecord` durch — ein Aufruf, dessen
RAG-Kontext aus einer als privat markierten Notiz stammt, wird also genauso protokolliert wie
jeder andere. Frühere Fassungen des CHANGELOGs behaupteten das Gegenteil („folder/feature
exclusion list") — das war unzutreffend, korrigiert 2026-08-23. Schließen braucht dieselbe Art
Vertrags-Umbau wie die Schlüssel-Lücke oben (ein Pfad-Feld auf `LabLogInput`, Verdrahtung in
jedem Konsumenten) und ist aus demselben Grund nicht Teil dieser Session.

## Modul-Layout (`src/`)

```
core/
  types.ts          TraceRecord — das Feldset, das auf die Platte geschrieben wird.
  record.ts         TraceInput → TraceRecord: hashPrompt (FNV-1a, kein Krypto-Anspruch — nur
                    unterscheidbar, nicht geheim) · hostOf (Host+Port aus einer URL, faellt
                    auf "unbekannt" zurueck statt zu werfen) · buildTraceRecord.
  redact_secrets.ts redactSecrets/redactRecordSecrets — Schlüssel-Maskierung, Lauf ist
                    unbedingt, aber in Slice 1 mit leerer Schlüsselliste verdrahtet (nur
                    das BEARER-Muster wirkt real) — s. „Bekannte Lücken in Slice 1".
  redact_pii.ts     redactPii — Muster-Maskierung mit record-weiten Platzhaltern, läuft nur
                    wenn redactPiiInTrace gesetzt ist (für den rohen Trace).
  rotation.ts       planRotation — reine Entscheidung, welche Trace-Dateien weg müssen
                    (Alter + Größengrenze, heutige Datei geschützt), `today` als Parameter
                    statt `Date` für Zeitreise-freie Tests.
  settings.ts       LabSettings · DEFAULT_SETTINGS · shouldLog(feature, paused, settings).
  trace_store.ts    TraceStore — TraceSink-Port injiziert, write() fire-and-forget,
                    writeNow() awaitbar (nur für Tests), rotate() nach jedem Schreiben.
  i18n/strings.ts   EN/DE-Wörterbuch, importiert für den Registrierungs-Seiteneffekt.
obsidian/
  settings_tab.ts   LabSettingTab — deklarative Setting-Zeilen, inkl. der beiden inhaltlich
                    verbindlichen Zeilen (Ablageort im Klartext, Grenzen der Maskierung).
  vault_sink.ts     vaultSink(adapter) — dünne Anpassung von Obsidians DataAdapter an
                    TraceSink; legt den Ordner beim ersten Schreiben an.
plugin_api.ts       createLlmLabApi — der öffentliche Vertrag (s. oben).
main.ts             Plugin-Entry: Sprache setzen, Settings laden, TraceStore/API verdrahten,
                    Statusleiste, toggle-pause-Command, Settings-Tab registrieren.
vendor/kit/i18n.ts  Verbatim-Snapshot aus obsidian-kit — nie von Hand editieren.
```

`src/core/` importiert nirgends `obsidian` (`npm run check:pure` erzwingt das). Nur
`main.ts`, `obsidian/settings_tab.ts` und `obsidian/vault_sink.ts` tun das.

## Commands

```bash
npm install                       # Deps
npm run dev                       # esbuild watch
npm run build                     # tsc --noEmit + esbuild --production
npm run typecheck                 # tsc --noEmit
npm run typecheck:test            # tsc -p tsconfig.test.json --noEmit
npm test                          # vitest run
npm run lint                      # check-no-inline-disables + eslint src --max-warnings 0
npm run check:pure                # scripts/check-pure.mjs — src/core darf obsidian nicht importieren
npm run gate                      # lint + typecheck + typecheck:test + test + check:pure + build
OBSIDIAN_PLUGIN_DIR=… npm run deploy   # build + main.js/manifest.json/styles.css ins Vault-Plugin-Verzeichnis
npm run version-bump / preflight / release   # delegieren ans zentrale ../tools/release/ (Dach)
```

## Conventions

- **TS strict + `noImplicitAny`** — keine `any`-Casts für neue Typen.
- **TDD** (`superpowers:test-driven-development`): der reine Kern wird test-first gebaut.
- **Tests:** vitest, Node-Umgebung — `src/core/` braucht keinen DOM-Mock, weil es kein DOM
  berührt. Nach jeder Änderung müssen alle Tests grün bleiben.
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
- **`shouldLog` ignoriert `paused`, wenn `settings.enabled` bereits `false` ist** (kurzschließt
  in dieser Reihenfolge) — beide Bedingungen sind trotzdem unabhängig zu lesen: `enabled` ist
  persistiert, `paused` ist Sitzungszustand und wird bewusst NICHT persistiert (eine Pause
  soll beim nächsten Start von selbst enden).
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
