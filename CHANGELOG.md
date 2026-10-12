# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.9.1] — 2026-10-12

### Changed

- Kit pins raised to `obsidian-kit` 0.56.0 and `code-kit` 0.23.0 (from 0.51.3 and 0.18.0). Nothing you can see changes: the trace log masks keys and personal data exactly as before. The plugin vendors only `redact` and the settings/hub modules from the kit; the broader `Bearer` rule of code-kit 0.21.0 (eight characters, any capitalization, also hits prose such as "Bearer authentication") belongs to the kit's text redaction, which the trace log does not use, so log entries are not masked more widely. The linear `<think>` removal of code-kit 0.22.0 is in a module this plugin does not vendor.
- The settings screenshot in the README now shows the current Settings page, including the Help row.

## [0.9.0] — 2026-10-10

### Changed

- **Masking of API keys and personal data in traces and datasets now comes from the shared code-kit module `redact` (code-kit 0.18.0).** The placeholders stay the same (`[EMAIL_1]`, `[IBAN_1]`, …) and so does the mask (`••••`). Visible differences: if one of your keys is the beginning of another, the longer one is now masked completely (before, the rest of it stayed readable in a trace); your own terms in the PII settings are de-duplicated and the longest is replaced first (with `Zitrone` and `Zitronenbaum`, the longer word is no longer cut in the middle); a mask is no longer expanded when it contains `$&`. E-mail detection is faster on very long runs of address characters, with the same matches.
- Shared kit modules (settings walker, hub tab bar, confirm dialog, help row, i18n) are now vendored by the central kit-sync tool from obsidian-kit 0.51.3 and code-kit 0.18.0, instead of hand-copied older versions. The folder picker of the settings walker is included.

## [0.8.1] — 2026-10-03

### Added
- The GitHub release now also carries a ready-to-unpack `llm-lab.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Changed

- The changelog is now written entirely in English.

## [0.8.0] — 2026-09-26

### Added
- Help row at the top of the settings with links to the documentation and the issue tracker (English and German), from `obsidian-kit` 0.43.0 (`help-setting.ts`, copied on its own with its origin stamp).

### Fixed
- German settings texts now use proper umlauts ("Maximale Trace-Größe", "Zusätzliche Begriffe maskieren", "entfällt", "zählen" and four more) instead of the ASCII replacements.

## [0.7.1] — 2026-09-24

### Changed
- `authorUrl` in the manifest points to the GitHub profile again (return to the Community Store); no functional change.

## [0.7.0] — 2026-09-17

### Added
- **README illustrated** (`docs/images/hero.png`, `rate-empty.png`, `rate-details.png`,
  `settings.png` + thumbnails) — captured reproducibly via the capture contract
  `docs/images/README.md` and the recipe `scripts/shots.ts` (`npm run shots`/`shots:check`),
  embedded in `README.md` and `README.de.md`. The four old debug screenshots from
  `docs/images/welle3/` are removed: German UI, foreign edges, no contract.

### Changed
- **`authorUrl` points to `https://jkaindl.de`** instead of the abandoned GitHub profile
  (target value of the umbrella repo since 2026-09-03); `tests/manifest.test.ts` checks the new value.

## [0.6.0] — 2026-09-17

### Fixed
- **Two leaves of the same rating view shared one `RatePanel` instance** (I2).
  Restoring the layout, splitting or "move to new window" let the second leaf overwrite the
  first one's DOM container; an `onClose()` could thereby empty the other leaf. Each leaf now
  gets its own instance (factory instead of a shared field in `main.ts`).
- **Focus was lost after every click** (M2) — `render()` now refocuses the container
  again, in both branches (list AND empty state).
- **`Enter`/`j`/`k` in a filter control were intercepted by the keyboard handler** (M3) —
  `onKey` now skips events whose target is an `INPUT`/`SELECT`/`BUTTON`/`TEXTAREA`.
- **`LabView.getState()` discarded what `ItemView` itself would persist** (M4).
- **Deleting shortly before midnight could wrongly report success** (M7) — a record that,
  because of fire-and-forget, was written to the next day's file only after midnight
  is now found there too; with no match `removeRecord` now reports `false` instead of
  silently returning `true`.
- **`vaultSink` derived a directory without a slash incorrectly** (M10) — unreachable
  today, the assumption is now stated explicitly in a function of its own.

### Changed
- **"Better answer" in the details modal uses the full modal width** instead of the
  narrow setting-control column.
- **The GUI smoke now reads `apiVersion` directly from `src/plugin_api.ts`** instead of
  carrying it as a number (I5) — it had gone stale three times in a row. Check 22 (delete) picks its
  row via `data-id` instead of by position, so that a millisecond collision
  between two test records does not turn the check red by chance (M5). New check 16b
  opens two leaves and closes one of them — regression protection for I2.

## [0.5.0] — 2026-09-16

### Added
- **Rating view.** A tab in the main area lists recorded calls, shows prompt
  and response at reading width and accepts a verdict by keyboard (`j`/`k` to browse,
  `g` good, `b` bad, `Del` delete). Rated items are copied to `dataset.jsonl` in redacted form
  — the trace expires with the rotation, the dataset survives it. Every action is
  also reachable as a command.
- **`apiVersion` 4: `turnId` on `LabLogInput`.** Brackets several LLM calls that belong to one
  user action (agent loop with tool calls). Optional — a consumer that reports nothing
  behaves unchanged.

### Changed
- **GUI smoke: the subject under test comes from the run, not from the convention.** The
  deploy comparison read `stagingVaultDir("llm-lab")`, while the driver attaches via `--vault` to an
  arbitrary window — a run against a foreign vault would have checked the file in the
  staging vault and passed green. It now sits behind `attachTo` and
  takes `app.vault.adapter.basePath` + `app.vault.configDir` from the running instance. Plus
  `requireEigenerBuild` (central bridge) against the case `manifest.version` is blind
  to: store and repo builds carry the same number. Counter-check across all four outcomes and
  a run against a foreign window — see `docs/SMOKE.md`.

## [0.4.0] — 2026-08-30

### Added
- `npm run smoke:e2e` (`scripts/e2e-crossplugin.ts`) — proves the path across the
  real plugin boundary (vault-rag → `api.log()` → llm-lab → disk), which both
  GUI smokes structurally skip. Requires both plugins to be installed and
  is therefore not part of `gate`/`smoke:gui`.

### Changed
- **BREAKING (`apiVersion` 2 → 3):** The prompt hash in the trace now identifies a prompt
  **version** instead of a call. For this, consumers report the stable part of their
  system prompt as `promptTemplate`; in the record the field is called `promptTemplateHash` and
  replaces `systemPromptHash`. Without a reported `promptTemplate` no hash is created — a
  missing field instead of an ambiguous one. Consumers that check strictly for `apiVersion` 2
  stay silent until they catch up.

## [0.3.0] — 2026-08-24

### Added
- `LabLogInput.secrets` — a calling plugin can pass along its endpoint keys;
  they are masked exactly and never end up in the record.
- `LabLogInput.contextPaths` plus the settings "Never record notes from these folders"
  and "Strict folder exclusion": an excluded path
  prevents a record from being created at all.

### Changed
- **BREAKING:** `apiVersion` 1 → 2. Consumers that check strictly for 1
  stay silent until they catch up (vault-rag follows in the same effort).
- `shouldLog` takes a `LogDecisionInput` instead of a feature string.

### Fixed
- Key masking ran with a permanently empty list and was thus effectively
  ineffective (only the BEARER pattern took hold) — documented as "known gap
  in Slice 1", now closed.
- The folder filter required by the spec (§5.5) was missing entirely.
- The folder filter's limit was phrased per *plugin* (settings tab, both
  READMEs) and thereby suggested "plugin X reports paths, so X is covered".
  Measured, it applies per **call**: the same vault-rag chat reports nothing if
  no context note is attached. Wording clarified (not a behavior fix,
  a promise fix).
- Added three test cases for key masking (`\`, line break,
  tab) — until then only the quote case covered the JSON escaping.

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
