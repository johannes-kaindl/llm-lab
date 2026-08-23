# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
