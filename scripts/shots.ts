/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Warum getrackt: dieselbe Begruendung wie bei `scripts/gui-smoke.ts`, mit dem sich dieser
 * Treiber die CDP-Bruecke UND das Fixture (`docs/images/fixture/`) teilt. Bruecke,
 * Aufnahme-Primitive und Fixture→Vault liegen zentral im Dach
 * (`obsidian-plugins/tools/obsidian-cdp/`), dieser Treiber importiert sie von dort.
 *
 * ## Anders als der GUI-Smoke: die REGULAERE Instanz, nicht die Zweitinstanz
 *
 * README-Bilder sollen den echten Vault-Look zeigen (Skill `readme-shots`, Dach-`AGENTS.md`
 * § Staging-Vaults) — eine Zweitinstanz mit eigenem `--user-data-dir` ist hier KEIN Ersatz.
 * Der Staging-Vault (`$STAGING_VAULTS_DIR/llm-lab`) muss deshalb als Fenster in der
 * REGULAEREN Instanz (Port 9222) offen sein, von Hand geoeffnet (Vault-Wechsler → „Ordner
 * als Vault oeffnen") — ein Treiber kann das programmatisch nicht herstellen (Skill,
 * Abschnitt „Vorbedingung").
 *
 * ⚠️ **Vor jedem Zugriff pruefen, wer sonst an der Instanz haengt — und NIE quitten.**
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "laeuft — mitnutzen"
 * ```
 *
 * ## Zweite Vorbedingung: Obsidians Oberflaeche auf Englisch
 *
 * Die Sprache ist app-weit; der Treiber PRUEFT `document.documentElement.lang` vor dem
 * ersten Bild und bricht mit Klartext ab, statt sie selbst umzustellen (das wuerde den
 * Arbeits-Vault der regulaeren Instanz mit umstellen). S. `docs/images/README.md`.
 *
 * ## Ablauf
 *
 * ```bash
 * npm run deploy                     # aktuellen Build in den Staging-Vault bringen
 * # im laufenden Obsidian: llm-lab aus- und wieder einschalten
 * npm run shots -- --list            # Vertrag anzeigen
 * npm run shots                      # alle vier Bilder
 * npm run shots -- --only hero.png   # ein Bild nachziehen
 * ```
 *
 * `--setup` existiert nur als Parität zum Fixture-Vertrag (baut den Vault aus
 * `docs/images/fixture/` neu, identisch mit `gui-smoke.ts --setup`) — ein Nachzieh-Lauf
 * braucht es nicht: der Vault ist bereits gebaut und registriert, `--setup` verlangt einen
 * Obsidian-Neustart, den dieser Vertrag bewusst vermeidet.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import {
  attachTo,
  Cdp,
  closeExtraLeaves,
  openExisting,
  pollUntil,
  setAppConfig,
} from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture, setWindowSize, writeShot, type Rect, type ShotOptions } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "llm-lab";
const REPO_NAME = "llm-lab";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const PADDING = 12;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;

/** Generisch und englisch, an die Fixture-Notizen angelehnt (`docs/images/fixture/notes/`) —
 *  keine echten Namen, Firmen, Nummern, Adressen (Skill readme-shots). */
const SEED_RECORDS: Array<{
  plugin: string;
  feature: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  content: string;
  latencyMs: number;
  ttftMs?: number;
}> = [
  {
    plugin: "vault-retrieval",
    feature: "chat",
    model: "qwen2.5-14b-instruct",
    messages: [
      { role: "system", content: "You are a note-taking assistant. Answer using the provided context." },
      { role: "user", content: "According to my notes, where does the recorded data actually live?" },
    ],
    content:
      "Your note \"Where the data lives\" says every trace is written as a JSON line inside "
      + "`.obsidian/plugins/llm-lab/traces/`, inside the vault itself — no external database "
      + "or cloud endpoint.",
    latencyMs: 812,
    ttftMs: 210,
  },
  {
    plugin: "vault-retrieval",
    feature: "chat",
    model: "qwen2.5-14b-instruct",
    messages: [
      { role: "system", content: "You are a note-taking assistant. Answer using the provided context." },
      { role: "user", content: "Summarize the note about latency and first token." },
    ],
    content:
      "The note distinguishes total latency from time-to-first-token: a slow model can still "
      + "feel responsive if the first token arrives quickly, which is why both numbers are "
      + "recorded separately.",
    latencyMs: 640,
  },
  {
    plugin: "vault-crews",
    feature: "reformat:to-list",
    model: "llama-3.1-8b-instruct",
    messages: [
      { role: "user", content: "Turn this paragraph into a bullet list: keep recordings small, rotate old trace files, redact secrets before writing." },
    ],
    content: "- Keep recordings small\n- Rotate old trace files\n- Redact secrets before writing",
    latencyMs: 305,
  },
  {
    plugin: "koda-agent",
    feature: "search",
    model: "qwen2.5-14b-instruct",
    messages: [
      { role: "user", content: "Find notes mentioning prompt versions." },
    ],
    content:
      "Found one match: \"Prompt versions\" — it explains how a stable prompt template gets "
      + "hashed separately from per-call content.",
    latencyMs: 980,
  },
];

// --- Zustand herstellen --------------------------------------------------------

/** Traces + Datensatz der Fixture-Installation weg, Plugin neu laden — der Staging-Vault
 *  ist Wegwerfware, ein sauberer Ausgangszustand ist Teil des Rezepts (s. Vertrag). */
async function zustandZuruecksetzen(cdp: Cdp, base: string): Promise<void> {
  await cdp.evaluate(`
    const base = ${JSON.stringify(base)};
    const adapter = app.vault.adapter;
    if (await adapter.exists(base + "/traces")) {
      const liste = await adapter.list(base + "/traces");
      for (const f of liste.files) await adapter.remove(f);
    }
    if (await adapter.exists(base + "/dataset.jsonl")) await adapter.remove(base + "/dataset.jsonl");
    return true;
  `);
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);
  await pollUntil<boolean>(cdp, `
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    return !!(p && p.api);
  `, 15_000, 500);
}

async function seedRecords(cdp: Cdp): Promise<void> {
  for (const r of SEED_RECORDS) {
    await cdp.evaluate(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api.log(${JSON.stringify({
        ...r,
        endpointUrl: "http://127.0.0.1:1234/v1/chat/completions",
      })});
    `);
  }
}

/** Rate-Tab oeffnen (Ribbon-Aequivalent per Command) und auf die gefuellte Liste warten. */
async function rateTabBereit(cdp: Cdp, erwarteteZeilen: number): Promise<boolean> {
  await cdp.evaluate(`
    await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-view`)});
    return true;
  `);
  return Boolean(await pollUntil<boolean>(cdp, `
    return document.querySelectorAll(".llm-lab-zeile").length >= ${erwarteteZeilen};
  `, 10_000, 300));
}

// --- Rezept ---------------------------------------------------------------------

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  run(cdp: Cdp, base: string): Promise<Rect | null>;
}

const SHOTS: Shot[] = [
  {
    // Zuerst, VOR dem Seeden: der Empty-State existiert nur, solange nichts angekommen ist.
    name: "rate-empty.png",
    klasse: "detail",
    async run(cdp, base) {
      await zustandZuruecksetzen(cdp, base);
      if (!(await rateTabBereit(cdp, 0))) return null;
      const leer = await pollUntil<boolean>(cdp, `
        return !!document.querySelector(".llm-lab-empty");
      `, 8_000, 300);
      if (!leer) {
        console.log("      · kein .llm-lab-empty im DOM");
        return null;
      }
      return boxOf(cdp, ".llm-lab-rate", PADDING);
    },
  },
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      await seedRecords(cdp);
      if (!(await rateTabBereit(cdp, SEED_RECORDS.length))) return null;
      // Erste Zeile auswaehlen (das "Where the data lives"-Beispiel) — sie traegt das
      // aussagekraeftigste Prompt/Antwort-Paar fuer das Detail darunter.
      const ausgewaehlt = await cdp.evaluate<boolean>(`
        const zeile = document.querySelector(".llm-lab-zeile");
        if (!zeile) return false;
        zeile.click();
        return true;
      `);
      if (!ausgewaehlt) return null;
      await new Promise((r) => setTimeout(r, 300));
      return boxOf(cdp, ".llm-lab-rate", PADDING);
    },
  },
  {
    name: "rate-details.png",
    klasse: "detail",
    async run(cdp) {
      // Setzt auf dem Zustand von hero.png auf (Records schon da, erste Zeile ausgewaehlt) —
      // dieselbe Reihenfolge wie im Vertrag: rate-empty, hero, rate-details, settings.
      if (!(await rateTabBereit(cdp, SEED_RECORDS.length))) return null;
      const geoeffnet = await cdp.evaluate<boolean>(`
        const knoepfe = [...document.querySelectorAll(".llm-lab-aktionen button")];
        const details = knoepfe.find((b) => b.textContent?.includes(${JSON.stringify("Add tags, note, correction")}));
        if (!details) return false;
        details.click();
        return true;
      `);
      if (!geoeffnet) {
        console.log("      · kein \"Add tags, note, correction\"-Knopf gefunden");
        return null;
      }
      const da = await pollUntil<boolean>(cdp, `
        return !!document.querySelector(".modal-container");
      `, 8_000, 300);
      if (!da) return null;
      return boxOf(cdp, ".modal-content", PADDING);
    },
  },
];

// --- Einstellungen ----------------------------------------------------------------

/** Der Einstellungen-Tab lebt in einem EIGENEN Fenster (Muster aus 3d-codeblocks/shots.ts:
 *  URL `about:blank`, `attachTo("settings", …)` waehlt ueber die Sache, nicht den Titel). */
async function settingsBild(cdp: Cdp, port: number, opts: ShotOptions): Promise<string> {
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `);
  const fenster = await attachTo("settings", port, REPO_NAME);
  if (!fenster) return "settings.png — kein Einstellungen-Fenster gefunden";
  try {
    await fenster.send("Page.bringToFront");
    await setWindowSize(fenster, 1100, 1500);
    await new Promise((r) => setTimeout(r, 600));
    const box = await boxOf(fenster, ".vertical-tab-content", 0)
      ?? await boxOf(fenster, ".modal-content", 0);
    if (!box) return "settings.png — kein Inhaltsbereich im Einstellungen-Fenster";
    const png = await capture(fenster, box);
    return await writeShot(fenster, "settings.png", png, { ...opts, thumb: false });
  } finally {
    await fenster.evaluate("window.close(); return true;").catch(() => undefined);
    fenster.close();
  }
}

// --- Lauf -------------------------------------------------------------------------

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log(`  feature  settings.png`);
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, "docs/images/fixture"),
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log(
      "\n⚠️  Lief Obsidian waehrend dieses Setups, muss es JETZT neu starten — und das trifft\n"
      + "   die REGULAERE Instanz, an der moeglicherweise andere Sessions haengen. Erst fragen:\n"
      + "      lsof -nP -iTCP:9222 -sTCP:LISTEN\n"
      + "   Danach den Vault von Hand oeffnen (Vault-Wechsler → „Ordner als Vault oeffnen\").",
    );
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n`
      + "Den Aufnahme-Vault von Hand oeffnen (Vault-Wechsler → „Ordner als Vault oeffnen\"),\n"
      + "er darf neben anderen Vaults offen sein.",
    );
  }
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));

  await cdp.send("Page.bringToFront");
  await new Promise((r) => setTimeout(r, 2000));

  // Aufnahmesprache PRUEFEN, nicht setzen — sie ist app-weit, ein Umstellen wirkt erst nach
  // einem Neustart und hinterliesse den Arbeits-Vault der regulaeren Instanz englisch.
  const lang = await cdp.evaluate<string>(`return document.documentElement.lang || "";`);
  if (lang && !lang.startsWith("en")) {
    throw new Error(
      `Obsidians Oberflaeche laeuft auf "${lang}", der Bildvertrag verlangt Englisch.\n`
      + "  Umstellen (app-weit, wirkt nach einem Neustart): Settings → About → Language → English.\n"
      + "  Nach der Aufnahme zurueckstellen — sonst startet auch der Arbeits-Vault englisch.",
    );
  }

  const vaultInfo = await cdp.evaluate<{ basePath: string; configDir: string }>(`
    return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
  `);
  const deployDir = join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID);
  const hash = (p: string): string | null => {
    try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { return null; }
  };
  const abweichend = ["main.js", "manifest.json", "styles.css"].filter(
    (f) => hash(join(repoRoot, f)) !== hash(join(deployDir, f)),
  );
  if (abweichend.length) {
    throw new Error(
      `Der Vault traegt einen anderen Stand als der Arbeitsbaum (${abweichend.join(", ")}).\n`
      + `  OBSIDIAN_PLUGIN_DIR="${deployDir}" npm run deploy\n`
      + "Danach das Plugin im laufenden Obsidian aus- und wieder einschalten.",
    );
  }
  requireEigenerBuild(join(deployDir, "main.js"), join(repoRoot, "main.js"), (m) => console.warn(m));

  const base = `${vaultInfo.configDir}/plugins/${PLUGIN_ID}`;

  await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
  await setAppConfig(cdp, "readableLineLength", false);
  await setAppConfig(cdp, "showInlineTitle", false);
  await closeExtraLeaves(cdp);

  let ok = 0;
  let fehlend = 0;
  for (const shot of SHOTS) {
    if (nur && shot.name !== nur) continue;
    try {
      const box = await shot.run(cdp, base);
      const png = box ? await capture(cdp, box) : null;
      if (!png) {
        console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`);
        fehlend++;
        continue;
      }
      console.log(`  ✓ ${await writeShot(cdp, shot.name, png, {
        outDir,
        captureWidth: CAPTURE_WIDTH,
        thumbWidth: THUMB_WIDTH,
        thumb: shot.klasse === "detail",
      })}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
      fehlend++;
    }
  }

  if (!nur || nur === "settings.png") {
    console.log(`  · ${await settingsBild(cdp, port, { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH })}`);
  }

  cdp.close();
  console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
  if (fehlend) exit(1);
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
