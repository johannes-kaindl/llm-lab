# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository. Workspace-weite Standards (comply-or-explain): siehe [`../../workspace/_docs/CONVENTIONS.md`](../../workspace/_docs/CONVENTIONS.md) (maintainer-lokal, im Klon ggf. nicht vorhanden — dann ignorieren).

**Profil:** `ts-node` · `obsidian-plugin`.

## Project character

**Projekt:** `llm-lab` (manifest-`id` = Repo-Slug) — Obsidian-Plugin, das **anderen** Obsidian-Plugins eine Aufzeichnungs-API anbietet: jeder LLM-Aufruf, den ein Nachbarplugin macht, kann mit einer Zeile protokolliert werden (Modell, volle Nachrichtenliste, Antwort, Latenz, Fehler/Abbruch). Aus den Aufzeichnungen entsteht später (nicht in Slice 1) ein bewerteter Datensatz für Auswertung und Fine-Tuning. Autor: Johannes Kaindl.

**Warum es existiert:** Vier Plugins im Workspace sprechen mit lokalen LLMs (`vault-rag`, `koda-agent`, `vault-crews`, `obsidian-transmute`) — über die Qualität dieser Aufrufe existieren **keine Daten**. Ist Modell B besser als Modell A für ein Feature? Hat eine Prompt-Änderung geholfen oder geschadet? Heute wird das geraten. LLM Lab ist die laufende Erhebung dafür, **als eigenes Plugin**, nicht als Kit-Modul oder Feature in einem der vier: ein Protokoll von LLM-Interaktionen ist eine Fähigkeit, die niemand stillschweigend in einem Retrieval- oder Chat-Plugin haben will — „nicht installiert" ist eine stärkere Zusage als jeder Settings-Schalter, und der Wert entsteht gerade durch den Vergleich über Plugins hinweg.

**Nicht-Ziele:** kein eigener LLM-Client, kein Netzwerkzugriff, kein Export, keine Statistik-Auswertung (die Panels `stats` und `export` der Ansicht sind nicht gebaut; gebaut ist „Bewerten“). LLM Lab ruft nie selbst ein Modell auf — es zeichnet nur auf, was ein anderes Plugin bereits gesendet und empfangen hat.

## Architecture principles

`llm-lab` ist **Anbieter**, andere Plugins sind **Konsumenten** — dieselbe Bauart wie `vault-rag/src/plugin_api.ts` (Anbieter) und `koda-agent/src/obsidian/retrieval.ts` (defensiver Konsument), nur mit vertauschten Rollen:

```
llm-lab                                vault-rag / koda-agent / vault-crews / obsidian-transmute
  plugin.api ─────────────────────────► app.plugins.plugins["llm-lab"]?.api?.log(record)
  { apiVersion: 4, status(), log() }
```

Nicht verhandelbare Eigenschaften:

- **Kein Lab installiert → passiert nichts.** Der Zugriff ist ein Objekt-Lookup, der `null` liefert; ein Konsument liest ihn defensiv und bricht nie, wenn LLM Lab fehlt. Die Opt-in-Zusage ist damit technisch durchgesetzt, nicht versprochen.
- **`log()` ist fire-and-forget — der Rückgabetyp ist `string`, nicht `Promise<string>`.** Telemetrie darf einen laufenden Chat-Stream oder Reformat-Lauf niemals ausbremsen oder abbrechen. Die Signatur ist deshalb bewusst synchron: `log(input)` vergibt die id sofort und schreibt intern asynchron (`TraceStore.write` ruft `void this.writeNow(...)`, nie `await`et). Ein `Promise<string>` zwänge jeden Konsumenten, der die id für einen späteren Bewertungsknopf braucht, zu einem `await` mitten im Antwortpfad — genau die Kopplung, die diese Regel ausschließen soll.
- **Kein DOM über die Plugin-Grenze.** `plugin_api.ts` reicht Daten durch, nie Obsidian- oder DOM-Objekte. Ein Fremdplugin, das in ein fremdes Panel rendert, koppelt an Layout und CSS; eines, das eine id entgegennimmt, koppelt an eine Signatur.
- **`apiVersion` ist der Vertrag, nicht der Compiler.** Zwei eigenständige Repos (PROF-OBS-09) dürfen kein Build-Coupling eingehen — ein Konsument kopiert die Form (`LabLogInput`), importiert sie nie, und prüft `apiVersion` gegen seine eigene Konstante, bevor er sich auf die Form verlässt. Ein Bump ist ein koordiniertes Doppel-Release in fester Reihenfolge: **Anbieter zuerst, Konsument danach.** Stand: `4` (`LLM_LAB_API_VERSION` in `plugin_api.ts`); die Geschichte der Bumps steht in `docs/internal/decisions.md`.
- **Redaktion: zuerst die Schlüssel (exakte Ersetzung), dann PII (Muster) — niemals in der anderen Reihenfolge.** Die Schlüssel-Maskierung läuft immer, die PII-Redaktion nur mit `redactPiiInTrace`. Gründe und die einzige Stelle, an der beide zusammenkommen (`TraceStore.writeNow`): `.claude/rules/redaktion.md`.
- `src/core/` importiert nirgends `obsidian` (`npm run check:pure` erzwingt das). Nur `main.ts` und `src/obsidian/` (Settings-Tab, Sink, Ansicht, Panels) tun das.

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
STAGING_VAULTS_DIR=… npm run smoke:gui -- --setup         # Prüf-Vault aus docs/images/fixture/ bauen
STAGING_VAULTS_DIR=… npm run smoke:gui -- --port <port> --vault llm-lab   # GUI-Smoke gegen eine Zweitinstanz (Rezept im Kopf von scripts/gui-smoke.ts)
npm run smoke:e2e -- --port <port>   # Prüfpunkte über die echte Plugin-Grenze (setzt vault-rag UND llm-lab installiert voraus — nicht Teil von gate/smoke:gui)
npm run version-bump / preflight / release   # delegieren ans zentrale ../tools/release/ (Dach)
```

## Conventions

- **TS strict + `noImplicitAny`** — keine `any`-Casts für neue Typen.
- **TDD** (`superpowers:test-driven-development`): der reine Kern wird test-first gebaut.
- **Tests:** vitest, Node-Umgebung — `src/core/` braucht keinen DOM-Mock, weil es kein DOM berührt. Nach jeder Änderung müssen alle Tests grün bleiben.
- **GUI-Smoke (CORE-TEST-02 b):** `scripts/gui-smoke.ts` prüft gegen ein **laufendes** Obsidian, was gegen einen Mock strukturell nicht prüfbar ist — allen voran den Datei-Weg (`vault_sink.ts`) und die Rotation, die daran hängt, dass `adapter.stat()` unter `.obsidian/` eine Größe liefert. Prüfpunkte, Aufruf und Durchlauf-Vermerke stehen in `docs/SMOKE.md`; die CDP-Brücke kommt zentral aus `../tools/obsidian-cdp/` und wird importiert, nie vendored. Wer `vault_sink.ts`, `rotation.ts`, `main.ts::renderStatus` oder die Zeilen-Reihenfolge im Settings-Tab anfasst, fährt ihn — dort misst keine vitest-Suite mit. Der Treiber prüft zuerst, ob er den eigenen Stand misst (Hash über drei Dateien plus `requireEigenerBuild`, gemessen am Pfad der laufenden Instanz): `docs/SMOKE.md`.
- **i18n:** nutzersichtbare Strings via `t()` (`src/vendor/kit/i18n.ts`), EN kanonisch + DE. **Nie ein `t()`-Aufruf auf Modul-Ebene oder in einem Klassenfeld** — `setLang()` läuft in `onload`, nach der Modul-Auswertung; ein `t()` davor friert die Sprache still auf den Default ein. `tests/i18n/keys.test.ts` ist der (verbreiterte) Wächter dafür.
- **Commits:** Conventional Commits, deutsche Beschreibung erlaubt. **Nur berührte Dateien stagen — nie `git add -A`.** Trailer bei substanziellem AI-Beitrag: `Co-Authored-By: <Modell> <noreply@anthropic.com>`.
- **Nie absolute Pfade außerhalb des Repos in Repo-Dateien** — Platzhalter (`$VAULT/…`) verwenden.

## Gotchas

- ⚠️ **Das Plugin kann nicht selbst merken, dass es niemand benutzt — und alle Prüfungen bleiben dabei grün.** Am 2026-09-02 gemessen: in `10_Pallas` war seit dem ersten Release **kein einziger echter Record** entstanden (`.obsidian/plugins/llm-lab/` trug nur die drei Deploy-Dateien, weder `traces/` noch `data.json`), obwohl llm-lab 0.4.0 und vault-retrieval 0.29.0 installiert **und** aktiviert waren und die Verdrahtung im Build steckte. Kein Defekt: `vault-rag` ist der einzige Konsument, und sein Chat wurde nicht benutzt. **Gate und GUI-Smoke können das strukturell nicht melden — der Smoke erzeugt seine Prüf-Records selbst.** Wer „38/38 grün" liest, weiß damit, dass der Schreibweg funktioniert, *nicht* dass etwas aufgezeichnet wird. Die Frage „fließen Daten?" beantwortet nur ein Blick in den Plugin-Ordner des Arbeitsvaults. Folge für jede Slice, die auf Daten aufbaut: **erst den Konsumenten anschließen, dann die Auswertung bauen** — sonst entsteht eine Oberfläche für eine leere Datei.

## Context index

- Bevor du Redaktion, Maskierung oder den Record-Bau (`redact_pii.ts`, `record.ts`, `TraceStore.writeNow`) änderst: `.claude/rules/redaktion.md`.
- Bevor du `log()`, `shouldLog`, `contextPaths`/`secrets` oder den Ordner-Ausschluss änderst: `.claude/rules/vertrag-und-ausschluss.md`.
- Bevor du den Sink, die Rotation, das Entfernen oder den Datensatz (`trace_store.ts`, `vault_sink.ts`, `dataset_store.ts`) änderst: `.claude/rules/trace-schicht.md`.
- Bevor du den Settings-Tab änderst: `.claude/rules/settings-tab.md`.
- Vor Änderungen an Datenmodell oder Modul-Layout: `docs/internal/architecture.md`.
- Bevor du eine Altentscheidung übernimmst (apiVersion-Bumps, Kit-Verhältnis, UI-Umfang): `docs/internal/decisions.md`.
- Vor einem GUI-Smoke oder einem Lauf gegen ein Fenster: `docs/SMOKE.md`; Obsidian-Instanz, Lock, Treiber und Staging-Vaults stehen als Pfadregeln im Dach unter `../.claude/rules/`.

## Memory

- **Cockpit:** `$VAULT/25_Coding/llm-lab/` (Stand, Tasks, Session-Log — mnemetisches Substrat/SSOT). **SDD-Artefakte (Spec/Plan) liegen dort unter `_SDD/`, nicht im Repo** (CORE-META-14) — das Repo behält die verdichtete Design-Essenz in `docs/internal/` und im CHANGELOG.

## Abweichungen von der Leitkonvention

Keine.
