/**
 * Ende-zu-Ende-Beleg ueber die PLUGIN-GRENZE — vault-rag → api.log() → llm-lab → Platte.
 *
 * **Warum das nicht in `gui-smoke.ts` gehoert und kein Teil von `npm run gate` ist:**
 * Unser GUI-Smoke ruft `api.log()` selbst auf, vault-rags ruft ein Lab-**Stub** auf. Das ist
 * je fuer sich richtig — CORE-TEST-02 (b) verlangt die Verdrahtung getrackt im Repo, das sie
 * besitzt, und kein Treiber soll an eine fremde Installation gebunden sein. Die Folge ist
 * aber, dass **beide** Treiber genau die Naht ueberspringen: wo zwei Repos je ihre Haelfte
 * pruefen, prueft niemand die Verbindung. Dieses Skript prueft nur sie, und deshalb setzt es
 * ausdruecklich voraus, was der Smoke ausdruecklich nicht voraussetzt: beide Plugins echt
 * installiert im selben Vault, ein erreichbarer Chat-Endpunkt.
 *
 * Der Spy auf `api.log` **wrappt und reicht durch** — er ersetzt nichts, sonst pruefte man
 * wieder nur die eigene Haelfte.
 *
 * ```bash
 * npm run smoke:e2e            # Vault llm-lab, Port 9222
 * ```
 *
 * **Der Treiber wartet nach dem Tippen auf die Kontext-Chips, statt sofort zu senden.**
 * Das ist keine Bequemlichkeit: `currentPaths()` ist `pinned ∪ autoDocs`, `autoDocs` fuellt
 * ein 400-ms-Debounce, und `submit()` bricht den ab. Wer sofort klickt, sendet garantiert
 * ohne Kontext — und misst einen Zustand, den kein Benutzer erzeugt (Lesson 2026-08-24).
 *
 * Durchlauf-Vermerke: `docs/SMOKE.md` § Ende-zu-Ende ueber die Plugin-Grenze.
 */
import { Cdp, pollUntil } from "../../tools/obsidian-cdp/cdp.js";

const DIR = ".obsidian/plugins/llm-lab/traces";
const ok: string[] = []; const bad: string[] = [];
const record = (t: string, pass: boolean, d = "") => {
  (pass ? ok : bad).push(t + (d ? ` — ${d}` : ""));
  console.log(`  ${pass ? "✓" : "✗"} ${t}${d ? " — " + d : ""}`);
};

const cdp = await Cdp.attach(9222, "llm-lab");
console.log("\nEnde-zu-Ende: vault-rag → Plugin-Grenze → llm-lab\n");

// 0. Beide Plugins neu laden — der Hash-Guard sagt nichts darueber, was geladen IST.
await cdp.evaluate(`
  for (const id of ["llm-lab", "vault-retrieval"]) {
    await app.plugins.disablePlugin(id); await app.plugins.enablePlugin(id);
  }
  await new Promise(r => setTimeout(r, 1500)); return "reloaded";
`);

const readTrace = async () => cdp.evaluate<{ file: string | null; lines: string[] }>(`
  const l = await app.vault.adapter.list(${JSON.stringify(DIR)}).catch(() => ({ files: [] }));
  const f = (l.files || []).filter(p => p.endsWith(".jsonl")).sort().pop() || null;
  if (!f) return { file: null, lines: [] };
  const txt = await app.vault.adapter.read(f);
  return { file: f, lines: txt.split("\\n").filter(Boolean) };
`);

// Spy, der DURCHREICHT — die echte Strecke bleibt vollstaendig.
await cdp.evaluate(`
  window.__e2e = [];
  const api = app.plugins.plugins["llm-lab"].api;
  if (!api.__wrapped) {
    const orig = api.log.bind(api);
    api.log = (i) => { window.__e2e.push(JSON.parse(JSON.stringify(i))); return orig(i); };
    api.__wrapped = true;
  }
  return api.apiVersion;
`).then(v => record("llm-lab meldet apiVersion 3 am laufenden Plugin", v === 3, `apiVersion ${v}`));

// Tippen, WARTEN, dann senden — nicht tippen-und-sofort-klicken: `currentPaths()` ist
// pinned ∪ autoDocs, und autoDocs fuellt ein 400-ms-Debounce, den `submit()` abbricht.
// Wer sofort klickt, sendet garantiert ohne Kontext — und damit ohne `contextPaths`.
const ask = async (frage: string) => {
  await cdp.evaluate(`
    await app.commands.executeCommandById("vault-retrieval:open-vault-chat");
    await new Promise(r => setTimeout(r, 1200));
    const ta = document.querySelector(".vault-rag-chat-input");
    ta.value = ${JSON.stringify(frage)};
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  `);
  const chips = await pollUntil<number>(cdp,
    `const n = document.querySelectorAll(".vault-rag-ctx-chip").length; return n > 0 ? n : null;`,
    30_000, 500).catch(() => 0);
  console.log(`    (Kontext-Panel: ${chips} Notiz(en) recherchiert)`);
  await cdp.evaluate(`document.querySelector(".vault-rag-chat-send").click(); return 1;`);
  return pollUntil(cdp,
    `const w = document.querySelector(".vault-rag-chat-working"); return !!w && /✓/.test(w.textContent || "");`,
    240_000, 1_000).then(() => true).catch(() => false);
};

// --- Durchgang 1: kein Ordner ausgeschlossen -> es MUSS eine Zeile entstehen -------------
const before = await readTrace();
const done1 = await ask("Was steht in meinen Notizen zu Latenz und erstem Token? Ein Satz.");
record("Chat ueber die Oberflaeche lief durch", done1);
await cdp.evaluate(`await new Promise(r => setTimeout(r, 2500)); return 1;`);
const after1 = await readTrace();
const neu1 = after1.lines.length - (after1.file === before.file ? before.lines.length : 0);
record("Eine neue Trace-Zeile ist auf der Platte gelandet", neu1 === 1, `${neu1} neue Zeile(n) in ${after1.file}`);

const rec = neu1 > 0 ? JSON.parse(after1.lines[after1.lines.length - 1]!) : null;
record("Die Zeile stammt vom Konsumenten vault-retrieval",
  rec?.plugin === "vault-retrieval" && rec?.feature === "chat",
  rec ? `plugin=${rec.plugin} · feature=${rec.feature} · model=${rec.model}` : "keine Zeile");
record("contextPaths steht NICHT im geschriebenen Record (Steuerdatum, kein Inhalt)",
  !!rec && !("contextPaths" in rec) && !JSON.stringify(rec).includes("contextPaths"),
  rec ? `Felder: ${Object.keys(rec).join(", ")}` : "keine Zeile");

const seen1 = await cdp.evaluate<Array<Record<string, unknown>>>(`return window.__e2e;`);
const cp = (seen1[seen1.length - 1]?.contextPaths ?? []) as string[];
record("…obwohl vault-rag sie ueber die Grenze mitgeschickt hat (sonst waere die Gegenprobe wertlos)",
  cp.length > 0, cp.length ? cp.join(", ") : "vault-rag schickte KEINE contextPaths");

// --- Durchgang 2: Treffer-Ordner ausgeschlossen -> es darf KEINE Zeile entstehen ---------
const ordner = cp.length && cp[0]!.includes("/") ? cp[0]!.split("/")[0]! : "Notes";
await cdp.evaluate(`
  const p = app.plugins.plugins["llm-lab"];
  p.settings.excludedFolders = [${JSON.stringify(ordner)}];
  p.settings.strictFolderExclusion = true;
  await p.saveData(p.settings); return p.settings.excludedFolders;
`);
console.log(`\n  Gegenprobe: Ordner "${ordner}" ausgeschlossen (strict)\n`);

const doneN = await ask("Was steht in meinen Notizen zu Latenz und erstem Token? Ein Satz.");
record("Der Chat laeuft trotz Ausschluss vollstaendig durch (Filter bremst den Konsumenten nicht)", doneN);
await cdp.evaluate(`await new Promise(r => setTimeout(r, 2500)); return 1;`);
const after2 = await readTrace();
const neu2 = after2.lines.length - (after2.file === after1.file ? after1.lines.length : 0);
record("KEINE neue Trace-Zeile — der Record entsteht gar nicht erst", neu2 === 0, `${neu2} neue Zeile(n)`);
const seen2 = await cdp.evaluate<number>(`return window.__e2e.length;`);
record("…und das liegt am Filter, nicht daran, dass log() ungerufen blieb",
  seen2 === seen1.length + 1, `api.log() wurde ${seen2 - seen1.length}× zusaetzlich gerufen`);

// Aufraeumen
await cdp.evaluate(`
  const p = app.plugins.plugins["llm-lab"];
  p.settings.excludedFolders = []; await p.saveData(p.settings);
  delete window.__e2e; return "clean";
`);

console.log(`\n${ok.length}/${ok.length + bad.length} Pruefpunkte gruen`);
if (bad.length) { console.log("\nOffen:"); bad.forEach(b => console.log("  ✗ " + b)); }
process.exit(bad.length ? 1 : 0);
