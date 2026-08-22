# LLM Lab

**Record every local LLM call your Obsidian plugins make, so the good answers can be rated and turned into evaluation or fine-tuning material.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://git.jkaindl.de/jkaindl/llm-lab/src/branch/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://git.jkaindl.de/jkaindl/llm-lab/src/branch/main/LICENSE-DOCS)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20%26%20mobile-7c3aed)

## What it does

Several Obsidian plugins in this workspace talk to local LLMs (a RAG assistant, a chat
plugin, a crew orchestrator, a search-and-replace plugin) — and none of them keep any record
of how well those calls actually go. LLM Lab is a small, quiet recorder that a sibling plugin
can call once per LLM interaction:

```ts
const lab = app.plugins.plugins["llm-lab"]?.api;
lab?.log({ plugin: "vault-retrieval", feature: "chat", model, endpointUrl, messages, content, latencyMs, /* … */ });
```

That single call writes one line to a rotating, append-only log — the model used, the full
message history, the response, timing, and whether the call errored or was cut off by a
token limit. Nothing more happens by itself: LLM Lab does not call any model, does not talk
to the network, and does not read or write anything in your notes.

## What it does **not** do

- **It is not an LLM client.** It never sends a request to a model or an endpoint — it only
  records what a *different* plugin already sent and received.
- **It does not work on its own.** Installing LLM Lab with no other plugin calling its API
  records nothing at all. It is infrastructure for plugin authors, not a standalone feature
  for end users.
- **Slice 1 ships no rating UI, no dataset browser, and no export.** Those depend on a rated
  dataset layer that this release deliberately does not build yet — see the changelog for
  what is coming. Right now, LLM Lab has exactly one visible surface: its settings tab.
- **It does not find everything sensitive.** See the section below — this is the one place in
  this README that is not allowed to be soft about it.

## What is recorded, and where

Every trace LLM Lab writes lands as one JSON line in
`.obsidian/plugins/llm-lab/traces/YYYY-MM-DD.jsonl` — inside the vault the recording plugin
is installed in, in plain text. There is no separate database, no cache directory outside the
vault, and no network endpoint it phones home to.

That has one direct consequence: **whether that folder gets synced or backed up is entirely
your own vault's configuration, not LLM Lab's.** If your sync setup mirrors
`.obsidian/plugins/` (or you back up the whole vault), the trace files go wherever that setup
already sends everything else. LLM Lab does not add a sync mechanism and does not exempt
itself from your existing one either way.

Before anything is written, two masking passes run in a fixed order — API keys and Bearer
tokens first, unconditionally, on every write; then, only if the stricter "redact PII in
trace" setting is turned on (default: off), a second pass over the message and response text:

**The masking finds patterns. It is deliberately not told to find meaning.** Concretely, it
catches:

- e-mail addresses
- IBANs
- phone numbers
- credentials embedded in a URL (`user:pass@host`)

and replaces each with a numbered placeholder (`[EMAIL_1]`, `[IBAN_1]`, …) that stays
consistent across every text field of one record — the same address gets the same number in
the prompt and in the answer.

**It does *not* find, and will never find by pattern-matching:**

- names
- physical addresses
- medical or other diagnoses
- relationships between people ("my daughter", "our accountant")

If a conversation contains any of those — and a system prompt or RAG context assembled from
your own notes very well might — they are recorded exactly as written, in the raw trace file,
by default. Turning on the settings toggle extends the same pattern-only masking to the raw
trace too, but the limitation above still applies: it is not a general anonymizer, and it is
not audited to any compliance standard. Treat every recorded trace as being exactly as
confidential as the notes and prompts that produced it — this section exists to prevent a
false sense of safety, not to create one.

**Nothing is recorded unless a sibling plugin calls the API, and uninstalling LLM Lab is the
off switch.** There is no account, no license check, and no background service to disable —
removing the plugin from a vault stops all recording for that vault immediately.

## Install

### From source

```bash
git clone https://git.jkaindl.de/jkaindl/llm-lab
cd llm-lab
npm install
npm run build   # produces main.js
```

Copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/llm-lab/` and enable the
plugin under **Settings → Community plugins**. A community-plugin listing and prebuilt
releases are not available yet — this is a pre-release, source-only plugin.

## Settings

| Setting | Default | Effect |
|---|---|---|
| **Recording enabled** | on | Master switch. Off means no trace is ever written, regardless of what calls the API. |
| **Days to keep** | 7 | Trace files older than this are deleted on rotation. Today's file is never deleted. |
| **Max total size (MB)** | 20 | Once the kept trace files exceed this, the oldest are deleted first — today's file is exempt. |
| **Excluded features** | `settings-probe` | One feature identifier per line. A calling plugin's own connectivity probes are the typical entry — traffic that is not a real interaction. |
| **Custom PII terms** | *(empty)* | One term per line, in addition to the built-in e-mail/IBAN/phone/URL-credential patterns — masked the same way, with the same numbered-placeholder consistency. |
| **Redact PII in trace** | off | Applies the PII masking pass to the raw trace as well, not only to a future rated dataset. Off by default because debugging a bad answer needs to see what was actually sent. |

A status-bar item and the **"Toggle recording pause"** command let you pause and resume for
the current session without touching settings — the pause is intentionally not persisted, so
nobody stays silently paused for weeks after a "not right now."

## For plugin authors

LLM Lab's only public surface for other plugins is `app.plugins.plugins["llm-lab"]?.api`:

```ts
interface LlmLabApi {
  readonly apiVersion: number;
  status(): { apiVersion: number; recording: boolean };
  log(input: LabLogInput): string; // returns the trace id synchronously
}
```

`log()` is fire-and-forget by design: it returns the assigned id immediately and writes to
disk asynchronously, so a caller mid-stream is never slowed down or blocked by logging. Read
the API defensively (LLM Lab may not be installed) and never `await` `log()` — it has nothing
to await. See [`AGENTS.md`](AGENTS.md) for the full contract and the reasoning behind it.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow
(test-driven, `main` always green, feature work in `feat/<name>`, Conventional Commits) and
[AGENTS.md](AGENTS.md) for the architecture and module conventions. The canonical repository
lives on Forgejo (`git.jkaindl.de/jkaindl/llm-lab`); GitHub (`johannes-kaindl/llm-lab`) is a
mirror.

## License

- **Code:** [AGPL-3.0-or-later](LICENSE). A commercial dual-license is available on request if the AGPL copyleft does not fit your use case.
- **Documentation and text:** [CC BY-SA 4.0](LICENSE-DOCS).

Copyright © 2026 Johannes Kaindl.
