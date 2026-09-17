# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added
- **README bebildert** (`docs/images/hero.png`, `rate-empty.png`, `rate-details.png`,
  `settings.png` + Thumbnails) — reproduzierbar aufgenommen über den Aufnahme-Vertrag
  `docs/images/README.md` und das Rezept `scripts/shots.ts` (`npm run shots`/`shots:check`),
  eingebettet in `README.md` und `README.de.md`. Die vier alten Debug-Screenshots aus
  `docs/images/welle3/` sind entfernt: deutsche Oberfläche, Fremdkanten, kein Vertrag.

### Changed
- **`authorUrl` zeigt auf `https://jkaindl.de`** statt auf das aufgegebene GitHub-Profil
  (Dach-Sollwert seit 2026-09-03); `tests/manifest.test.ts` prüft den neuen Wert.

## [0.6.0] — 2026-09-17

### Fixed
- **Zwei Leaves derselben Bewertungs-Ansicht teilten sich eine `RatePanel`-Instanz** (I2).
  Layout-Wiederherstellung, Split oder „in neues Fenster verschieben" ließen die zweite
  Leaf den DOM-Container der ersten überschreiben; ein `onClose()` konnte dadurch die
  jeweils andere Leaf leeren. Jede Leaf bekommt jetzt ihre eigene Instanz (Factory statt
  geteiltem Feld in `main.ts`).
- **Fokus ging nach jedem Klick verloren** (M2) — `render()` fokussiert den Container
  jetzt wieder, in beiden Zweigen (Liste UND Empty-State).
- **`Enter`/`j`/`k` in einem Filter-Control wurden vom Tastatur-Handler abgefangen** (M3) —
  `onKey` überspringt jetzt Ereignisse, deren Ziel ein `INPUT`/`SELECT`/`BUTTON`/`TEXTAREA`
  ist.
- **`LabView.getState()` verwarf, was `ItemView` selbst persistieren würde** (M4).
- **Löschen kurz vor Mitternacht konnte fälschlich Erfolg melden** (M7) — ein Record, der
  wegen fire-and-forget erst nach Mitternacht in die Folgetagsdatei geschrieben wurde,
  wird jetzt auch dort gefunden; ohne Treffer meldet `removeRecord` jetzt `false` statt
  stillschweigend `true`.
- **`vaultSink` leitete ein Verzeichnis ohne Schrägstrich falsch ab** (M10) — heute
  unerreichbar, die Annahme steht jetzt explizit in einer eigenen Funktion.

### Changed
- **„Bessere Antwort" im Vertiefungs-Modal nutzt die volle Modalbreite** statt der
  schmalen Setting-Control-Spalte.
- **GUI-Smoke liest `apiVersion` jetzt direkt aus `src/plugin_api.ts`** statt sie als Zahl
  mitzuführen (I5) — war dreimal in Folge veraltet. Prüfpunkt 22 (Löschen) wählt seine
  Zeile über `data-id` statt über die Position, damit eine Millisekunden-Kollision
  zwischen zwei Testrecords den Punkt nicht zufällig rot macht (M5). Neuer Prüfpunkt 16b
  öffnet zwei Leaves und schließt eine davon — Regressionsschutz für I2.

## [0.5.0] — 2026-09-16

### Added
- **Bewertungs-Ansicht.** Ein Tab im Hauptbereich listet aufgezeichnete Aufrufe, zeigt Prompt
  und Antwort in Lesebreite und nimmt ein Urteil per Tastatur entgegen (`j`/`k` blättern,
  `g` gut, `b` schlecht, `Entf` löschen). Bewertetes wird redigiert nach `dataset.jsonl`
  kopiert — der Trace verfällt mit der Rotation, der Datensatz überlebt sie. Jede Aktion ist
  zusätzlich als Befehl erreichbar.
- **`apiVersion` 4: `turnId` auf `LabLogInput`.** Klammert mehrere LLM-Aufrufe, die zu einer
  Nutzer-Handlung gehören (Agent-Loop mit Tool-Calls). Optional — ein Konsument, der nichts
  meldet, verhält sich unverändert.

### Changed
- **GUI-Smoke: der Prüfgegenstand kommt aus dem Lauf, nicht aus der Konvention.** Der
  Deploy-Abgleich las `stagingVaultDir("llm-lab")`, während der Treiber per `--vault` an ein
  beliebiges Fenster andockt — ein Lauf gegen einen fremden Vault hätte die Datei im
  Staging-Vault geprüft und wäre grün durchgelaufen. Er steht jetzt hinter `attachTo` und
  nimmt `app.vault.adapter.basePath` + `app.vault.configDir` aus der laufenden Instanz. Dazu
  `requireEigenerBuild` (zentrale Brücke) gegen den Fall, für den `manifest.version` blind
  ist: Store- und Repo-Build tragen dieselbe Nummer. Gegenprobe über alle vier Ausgänge und
  einen Lauf gegen ein fremdes Fenster — s. `docs/SMOKE.md`.

## [0.4.0] — 2026-08-30

### Added
- `npm run smoke:e2e` (`scripts/e2e-crossplugin.ts`) — belegt die Strecke ueber die
  echte Plugin-Grenze (vault-rag → `api.log()` → llm-lab → Platte), die beide
  GUI-Smokes strukturell ueberspringen. Setzt beide Plugins installiert voraus und
  ist deshalb nicht Teil von `gate`/`smoke:gui`.

### Changed
- **BREAKING (`apiVersion` 2 → 3):** Der Prompt-Hash im Trace identifiziert jetzt eine
  Prompt-**Fassung** statt eines Aufrufs. Konsumenten melden dafür den stabilen Anteil ihres
  System-Prompts als `promptTemplate`; im Record heißt das Feld `promptTemplateHash` und
  ersetzt `systemPromptHash`. Ohne gemeldeten `promptTemplate` entsteht kein Hash — ein
  fehlendes Feld statt eines mehrdeutigen. Konsumenten, die strikt auf `apiVersion` 2 prüfen,
  schweigen bis zu ihrem Nachzug.

## [0.3.0] — 2026-08-24

### Added
- `LabLogInput.secrets` — ein aufrufendes Plugin kann seine Endpunkt-Schluessel
  mitgeben; sie werden exakt maskiert und landen nie im Record.
- `LabLogInput.contextPaths` plus die Einstellungen „Notizen aus diesen Ordnern nie
  mitschreiben" und „Strenger Ordner-Ausschluss": ein ausgeschlossener Pfad
  verhindert, dass ein Record ueberhaupt entsteht.

### Changed
- **BREAKING:** `apiVersion` 1 → 2. Konsumenten, die strikt auf 1 pruefen,
  schweigen bis zum Nachzug (vault-rag zieht im selben Vorhaben nach).
- `shouldLog` nimmt ein `LogDecisionInput` statt eines Feature-Strings.

### Fixed
- Die Schluessel-Maskierung lief mit permanent leerer Liste und war damit real
  wirkungslos (nur das BEARER-Muster griff) — dokumentiert als „Bekannte Luecke
  in Slice 1", jetzt geschlossen.
- Der in der Spec (§5.5) verlangte Ordner-Filter fehlte vollstaendig.
- Die Grenze des Ordner-Filters war je *Plugin* formuliert (Settings-Tab, beide
  READMEs) und legte damit „Plugin X meldet Pfade, also ist X abgedeckt" nahe.
  Gemessen laeuft sie je **Aufruf**: derselbe vault-rag-Chat meldet nichts, wenn
  keine Kontextnotiz angehaengt ist. Wortlaut praezisiert (kein Verhaltens-,
  ein Zusagen-Fix).
- Drei Testfaelle fuer die Schluessel-Maskierung ergaenzt (`\`, Zeilenumbruch,
  Tabulator) — bis dahin deckte nur der Quote-Fall das JSON-Escaping ab.

## [0.2.0] — 2026-08-23

### Changed

- **Settings now use Obsidian's declarative settings API.** The settings tab implements
  `getSettingDefinitions()`, so on Obsidian 1.13 and later the host renders the settings
  itself and indexes them — **every LLM Lab setting is now findable through Obsidian's
  settings search**, which it previously was not. Measured against 1.13.7: 0 → 8 definitions
  taken over by the host, and a term from the plugin's own definitions now returns a hit in
  settings search where it returned none before.
- **`minAppVersion` stays at 1.8.7.** The tab renders the same single definition list through
  the classic settings API on anything below 1.13, so no user loses access. Nothing about
  this change requires a newer Obsidian.
- The two binding notice rows (where data is stored, what masking does and does not catch)
  are rendered explicitly rather than as plain definitions: a row without a control is
  silently skipped by the 1.13 renderer while the fallback draws it, which would make the two
  paths disagree. The masking-limits notice gained a heading as a result — it is now findable
  in settings search too, where before it was an unlabelled paragraph.

### Fixed

- An invalid number entered for "keep traces for (days)" or "maximum trace size (MB)" is now
  rejected on every render path instead of only the classic one.

## [0.1.0] — 2026-08-23

### Added

- **Slice 1: record, redact, rotate.** LLM Lab exposes `plugin.api.log(record)` to sibling
  Obsidian plugins — a synchronous call that returns a trace id immediately and writes to
  disk in the background, so a caller's chat stream or reformat run is never slowed down or
  blocked by logging. No plugin needs to install LLM Lab, and a caller that checks for the
  API and doesn't find it (`app.plugins.plugins["llm-lab"]?.api`) simply logs nothing.
- **Two-layer data model.** Every logged call lands as one line in a rotating
  `traces/YYYY-MM-DD.jsonl` (raw content, kept a configurable number of days and below a
  configurable size, today's file never rotated away). A verdict/rating layer
  (`dataset.jsonl`) is designed into the record shape for a later slice; Slice 1 ships the
  trace side only — there is no rating UI yet.
- **Redaction runs before anything touches disk, in a fixed order.** Bearer tokens that
  appear verbatim in recorded text are masked on every write, unconditionally — that pattern
  match is real. Endpoint API keys are **not** currently masked by exact match: the
  key-masking function is wired with a permanently empty key list, and there is no field on
  the logging API through which a calling plugin can supply one — a known Slice 1 gap, not a
  design choice (see `AGENTS.md` § "Bekannte Lücken in Slice 1"). PII patterns (e-mail, IBAN, phone
  numbers, credentials in URLs) are masked with placeholders that stay numbered and consistent
  across every text field of one record — off by default, only applied to the raw trace if
  the stricter "redact PII in trace" setting is turned on (debugging needs to see what was
  actually sent). Where both passes apply, key masking runs first and PII masking second —
  reversing the order would let a PII pattern fragment an API key before the exact-match key
  search ever sees it, leaving unmasked fragments on disk.
- **Fail-closed telemetry.** A write that cannot be serialized, or a disk error, is caught
  and logged to the console rather than crashing the caller — the call being logged has
  already completed upstream by the time it is written.
- **Rotation and exclusion settings**, a session-only pause switch (status bar icon + text,
  resets on restart so nobody stays silently paused for weeks), a feature exclusion list
  evaluated before a record is even built (folder-level exclusion is not implemented in
  Slice 1 — `log()` never receives a path, see `AGENTS.md` § "Bekannte Lücken in Slice 1"),
  and a settings-tab statement of exactly where the data lives and what the masking does
  and does not catch.
- **No UI beyond the settings tab.** Slice 1 deliberately ships no rating buttons, no
  dataset browser, no export — those depend on a dataset that does not exist yet in this
  slice.
