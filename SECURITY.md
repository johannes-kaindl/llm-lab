# Security Policy

## Supported Versions

Security updates are provided for the most recently released version of LLM Lab. Older versions do not receive backported fixes — please update to the latest release.

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public issues.

Instead, report them privately by email to **code@jkaindl.de** (PGP-encrypted mail is welcome). You will receive a prompt acknowledgement, and we will keep you informed as the fix progresses.

## Data Handling / Scope

LLM Lab is local-first by design, which is also its core security property:

- **Nothing is recorded unless a sibling plugin explicitly calls `plugin.api.log(...)`.**
  LLM Lab has no network client of its own and initiates no LLM calls. It is a passive
  recorder that other installed plugins choose to call — a vault with LLM Lab installed but
  no calling plugin present, or with recording turned off, or paused for the session,
  records nothing.
- **Everything recorded stays on disk, inside your vault.** Traces are written to
  `.obsidian/plugins/llm-lab/traces/` as plain JSON Lines files. Nothing is sent to any
  server, and LLM Lab has no telemetry of its own. Whether that folder is synced or backed
  up is entirely a function of your own vault sync/backup configuration — LLM Lab does not
  change that behavior.
- **Bearer tokens appearing verbatim in recorded text are masked on every write** — that
  pattern match is real and unconditional. **Endpoint API keys are masked by exact match on
  every write as well:** a calling sibling plugin passes its own keys along with the call
  (`secrets` on the logging API); they are used solely as a masking list and never become part
  of the record. The boundary of that promise: LLM Lab keeps no key list of its own, so this
  covers exactly the keys a calling plugin hands over — a plugin that passes none is back to
  the `Bearer` pattern alone. A second, optional pass masks PII patterns (e-mail addresses, IBANs, phone
  numbers, credentials embedded in URLs) with numbered placeholders that stay consistent
  across a whole record — off by default, only active when "redact PII in trace" is turned
  on. **The masking finds patterns, not meaning** — it does not find names, physical
  addresses, medical or other diagnoses, or relationships between people. Treat a recorded
  trace as being exactly as confidential as the notes and prompts that produced it.
- **Whole folders can be kept out of the log.** "Never record notes from these folders"
  (subfolders included) is evaluated *before* a record is built: a call that drew on a note
  from an excluded folder is never written, so there is nothing on disk to redact afterwards.
  "Strict folder exclusion" (on by default) means one excluded note is enough to skip the
  call; off, the call is skipped only when every note involved is excluded. **The boundary,
  stated because it is a promise with a condition:** the filter only applies to calls whose
  plugin reports which notes went into them. A plugin that reports no paths is recorded as
  before — this is deliberate (fail-open), so that enabling an exclusion cannot silently
  silence a caller that has not been updated yet.
- **Uninstalling the plugin is the off switch.** There is no separate account, license
  server, or background process to disable — removing LLM Lab from a vault stops all
  recording immediately and permanently for that vault.
- **A failure to write is swallowed, not surfaced as a crash.** The call being logged has
  already completed upstream by the time LLM Lab writes it; a disk error is logged to the
  console and never propagates back to the caller.

If you have questions about the plugin's data handling beyond what is described here, the same private contact above applies.
