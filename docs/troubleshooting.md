# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## No recordings yet

> No recordings yet. LLM Lab only records what another plugin sends it — nothing has arrived so far.

**Cause:** LLM Lab records nothing on its own. It only writes down calls that a *different* plugin reports through its API, and no such plugin has reported one (or none is installed).

**Fix:** install a plugin that reports to LLM Lab (the first one is [vault-rag](https://github.com/johannes-kaindl/vault-rag)) and use it, or play a consumer yourself — see [Getting started, step 3](getting-started.md#3-record-a-first-call). Also check the status bar (next entry).

## Lab: paused

> Lab: paused

**Cause:** you ran **LLM Lab: pause or resume recording**. The pause is deliberately not saved and ends at the next restart of Obsidian.

**Fix:** run the same command again; the status bar returns to **Lab: recording**. If it says recording and still nothing arrives, check **Record LLM calls** under **Settings → LLM Lab** — when that is off, nothing is written at all.

## A call I expected is missing

**Cause:** one of these filters applies, and none of them shows a message:

- **Never record these features** lists the feature key of the call (by default `settings-probe`, a plugin's own connectivity check).
- **Never record notes from these folders** lists a folder of a note that went into the call. With **Strict folder exclusion** on, a single such note is enough to skip the whole call.
- The calling plugin passes no note paths. The folder filter then cannot see the call, so it is recorded — and when a plugin reports no API at all, nothing arrives.

**Fix:** check the two lists under **Settings → LLM Lab**. To rule the filters out, empty both and repeat the call.

## Old recordings disappeared

**Cause:** traces are rotated. Files older than **Keep traces for (days)** are deleted, and when the kept files exceed **Maximum trace size (MB)** the oldest go first. Today's file is never deleted. Ratings you saved are not affected.

**Fix:** raise the two values under **Settings → LLM Lab**.

## Rating could not be saved

> Rating could not be saved. Please try again.

**Cause:** writing to the plugin's folder failed, for example because a sync client holds the file or the disk is full.

**Fix:** try again; if it persists, check that `.obsidian/plugins/llm-lab/` is writable and has free space.

## Recording could not be deleted

> Recording could not be deleted. Please try again.

**Cause and fix:** the same as above — the trace file could not be rewritten.

## This call failed, so there is no answer to judge

> This call failed, so there is no answer to judge. Errors are kept for debugging, not for the dataset.

**Cause:** the recorded call ended in an error, so there is no answer to rate.

**Fix:** none needed. Use the **Errors only** filter to find such calls; delete them if you do not want them kept.

## N unreadable lines skipped

> 2 unreadable lines skipped.

**Cause:** a trace file contains lines that are not valid JSON (for example after a sync conflict or a hand edit). The Rate tab skips them and shows the rest.

**Fix:** open the day's `.jsonl` file under `.obsidian/plugins/llm-lab/traces/` and remove or repair the broken lines.

## Getting help

Open an issue at <https://github.com/johannes-kaindl/llm-lab/issues>. Say which Obsidian version and platform you use, which plugin should have reported the call, what you did, and the exact text of any message.
