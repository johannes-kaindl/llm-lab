# Contributing to LLM Lab

Thanks for your interest in improving **LLM Lab** — an Obsidian plugin that lets sibling
plugins log every local LLM call they make, so their answers can later be rated and the
good ones exported for evaluation or fine-tuning.

Contributions of all sizes are welcome: bug reports, fixes, docs, and features. Before you
start, please skim [`AGENTS.md`](AGENTS.md) in the repo root — it holds the architecture,
module layout, and the detailed engineering conventions. This document is the
contributor-facing summary. The conventions below follow the workspace's leading
**comply-or-explain** convention: deviate when you have a good reason, and say why in the PR.

## Branch model

- `main` is always green — it must build, pass tests, and typecheck at every commit.
- Do feature work on a `feat/<name>` branch.
- Merge into `main` with `--no-ff` so the history keeps the merge structure.
- Direct pushes to `main` happen only with explicit authorization.

## Commits

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|docs|chore|refactor|test(scope): …`. The description itself may be written in German.
- Stage **only the files you actually touched**. Never use `git add -A`.
- When an AI tool made a substantial contribution to a commit, add a trailer:

  ```
  Co-Authored-By: Claude Opus <Version> (1M context) <noreply@anthropic.com>
  ```

- Don't bypass the pre-commit hooks (no `--no-verify`).

## Tags and remotes

- Releases are tagged with [SemVer](https://semver.org/) **without** a `v` prefix — e.g. `0.1.0`, not `v0.1.0`.
- Forgejo is the canonical, primary remote (`origin`).
- GitHub is a **mirror** only (used for the community plugin registry and release CI). Open your contributions against Forgejo.

## Quality gate

Run these locally before you commit, and make sure they're green:

- **Tests:** `npm test` — the suite is test-driven (Vitest).
- **Typecheck:** `npm run typecheck` (and `npm run typecheck:test` for the test sources) — must be clean.
- **Lint:** `npm run lint` — an inline-`eslint-disable` gate followed by ESLint, including the `eslint-plugin-obsidianmd` store-review checks.
- **Purity:** `npm run check:pure` — `src/core/` must never import `obsidian`; the reusable
  record-building, redaction, rotation and logging-decision logic has to stay testable in
  plain Node.
- **All of the above at once:** `npm run gate`.
- **Pre-commit hooks:** let them run; don't skip them with `--no-verify`.

The project is test-driven, so new behavior should arrive with tests.

All user-facing strings (settings, notices, the status-bar text) go through the i18n module
(`src/core/i18n/strings.ts`) with English canonical + German translation; never hard-code UI
text — see [`AGENTS.md`](AGENTS.md) § Conventions. A `t()` call must never sit at module
level or in a class field initializer — `setLang()` runs in `onload`, after module
evaluation, so a module-level `t()` silently freezes to the default language. Both
`tests/i18n/keys.test.ts` (module-level-`t()` guard, widened to catch `let`/`var`, class
fields and `export default`) and a running gate defend this.

## Architecture in one paragraph

`src/core/` is the pure kernel — the trace-record builder, secret and PII redaction, the
rotation decision, and the logging-settings gate (`shouldLog`) — with no `obsidian` import
anywhere in the tree (`npm run check:pure` enforces this). `src/obsidian/` is the thin
adapter layer: the settings tab and the `DataAdapter`-backed trace sink. `plugin_api.ts` is
the public contract other Obsidian plugins call through `plugin.api`; it is a thin adapter
over the core, not the core itself, in the same shape as `vault-rag/src/plugin_api.ts`. The
full rationale, including the two-layer data model and the redaction order, lives in
[`AGENTS.md`](AGENTS.md).

## Where to work

- File issues and open pull requests on **Forgejo**. (GitHub is a mirror, not the place for contributions.)
- For larger features, work through **brainstorm → spec → plan → TDD**. Smaller fixes can go straight to a `feat/<name>` branch with tests.
- The detailed conventions, architecture, and module layout live in [`AGENTS.md`](AGENTS.md).

## License of contributions

This project is dual-licensed by content type:

- **Code** is licensed under **AGPL-3.0-or-later** (see [`LICENSE`](LICENSE)). By contributing code, you agree that your contribution is licensed under AGPL-3.0-or-later.
- **Documentation and other text** is licensed under **CC BY-SA 4.0** (see [`LICENSE-DOCS`](LICENSE-DOCS)). By contributing docs, you agree that your contribution is licensed under CC BY-SA 4.0.

A commercial dual-license is available on request for users for whom the AGPL copyleft is not a fit.
