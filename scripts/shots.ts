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
      {
        role: "user",
        content:
          "Find notes mentioning prompt versions, and summarize what each one says about "
          + "how a version is identified.",
      },
    ],
    content:
      "Found three matches:\n\n"
      + "- \"Prompt versions\" — explains how a stable prompt template gets hashed "
      + "separately from per-call content, so retrieval context or user input never "
      + "changes the version identifier.\n"
      + "- \"Where the data lives\" — mentions in passing that a version hash is stored "
      + "alongside each trace, not computed after the fact.\n"
      + "- \"Latency and first token\" — cross-references the version hash when comparing "
      + "two runs of the same prompt template.\n\n"
      + "Common thread across all three: a version is defined by the *wording* of the "
      + "stable part of a prompt, not by the model, the endpoint, or anything that varies "
      + "per call. If you change the wording — even by translating it — that counts as a "
      + "new version, because the wording actually changed.\n\n"
      + "Want me to open the first note, or list the other notes that reference these "
      + "three?",
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

async function seedRecords(cdp: Cdp, base: string): Promise<void> {
  for (const r of SEED_RECORDS) {
    await cdp.evaluate(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api.log(${JSON.stringify({
        ...r,
        endpointUrl: "http://127.0.0.1:1234/v1/chat/completions",
      })});
    `);
  }
  // log() ist fire-and-forget (AGENTS.md „Anbieter, nicht Konsument") — die id kommt
  // synchron, der Schreibvorgang laeuft danach asynchron. Ohne diese Wartestufe war das
  // Oeffnen der Bewerten-Ansicht direkt danach im Volllauf beobachtbar (nicht isoliert)
  // manchmal schneller als die vier Schreibvorgaenge auf der Platte — die Ansicht las
  // dann eine noch unvollstaendige Trace-Datei und die Zeilenzahl blieb unter dem
  // Erwartungswert, bis `rateTabBereit` seine Frist ausschoepfte.
  await pollUntil<boolean>(cdp, `
    const base = ${JSON.stringify(base)};
    const adapter = app.vault.adapter;
    if (!(await adapter.exists(base + "/traces"))) return false;
    const liste = await adapter.list(base + "/traces");
    let zeilen = 0;
    for (const f of liste.files) {
      const inhalt = await adapter.read(f);
      zeilen += inhalt.split("\\n").filter((z) => z.trim().length > 0).length;
    }
    return zeilen >= ${SEED_RECORDS.length};
  `, 8_000, 200);
}

/** Rate-Tab oeffnen (Ribbon-Aequivalent per Command) und auf die gefuellte Liste warten.
 *  Schliesst eine vorhandene Lab-Leaf zuerst: der Command aktiviert nur eine bestehende
 *  (`revealLeaf`, `main.ts`), ohne den Panel-Zustand neu zu laden — ein zwischen zwei
 *  Aufnahmen geseedeter Record bliebe sonst unsichtbar, weil `RatePanel.reload()` nur bei
 *  `onShow()` des frisch geoeffneten Views laeuft, nicht bei jedem Aufruf des Commands. */
async function rateTabBereit(cdp: Cdp, erwarteteZeilen: number): Promise<boolean> {
  await cdp.evaluate(`
    // Nicht detach(): ohne Blatt bleibt keine Tab-Gruppe uebrig, an der
    // "main.ts::openView" (getLeaf(true)) neu splitten koennte ("No tab group found").
    // Der View-Typ wird stattdessen weggenommen, das Blatt selbst bleibt stehen.
    for (const leaf of app.workspace.getLeavesOfType("llm-lab-view")) {
      await leaf.setViewState({ type: "empty" });
    }
    await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-view`)});
    return true;
  `);
  return Boolean(await pollUntil<boolean>(cdp, `
    return document.querySelectorAll(".llm-lab-zeile").length >= ${erwarteteZeilen};
  `, 10_000, 300));
}

/** Box eines Panels, geschnitten auf seinen tatsaechlichen Inhalt statt auf seine volle
 *  (Fenster-hohe) Containerflaeche.
 *
 *  `boxOf(cdp, ".llm-lab-rate", PADDING)` hatte zwei Fehler, beide erst im echten
 *  Screenshot sichtbar (nicht an den Massen, die `boxOf` selbst zurueckgab):
 *  1. `.llm-lab-rate` ist so hoch wie sein Container (Hub-Content-Bereich), nicht so hoch
 *     wie sein Inhalt — bei nur einer geoeffneten Zeile oder dem Leerzustand blieb der
 *     Rest der Flaeche schwarz (400-600px in `hero.png`/`rate-empty.png`).
 *  2. Der `PADDING`-Rand von `boxOf` addiert sich auf ALLEN vier Seiten, auch nach OBEN
 *     und UNTEN ueber die tatsaechliche Panel-Grenze hinaus — dort liegen die Tab-Leiste
 *     ueber dem View und ggf. ein Statusleisten-Element darunter, beide rutschten als
 *     angeschnittener Rand ins Bild.
 *  Diese Funktion nimmt deshalb `rootSelector`s eigene Kanten fuer x/Breite/oberen Rand
 *  (kein Aufwaerts-Padding) und schneidet die Hoehe auf die untere Kante des LETZTEN
 *  sichtbaren Kindelements plus einem kleinen, panel-eigenen Rand (`bottomPadding`) —
 *  Hintergrundfarbe des Panels, keine fremde Kante. */
async function inhaltsBox(cdp: Cdp, rootSelector: string, bottomPadding = 16): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    if (!root) return null;
    const kinder = [...root.children].filter((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const rootR = root.getBoundingClientRect();
    if (!kinder.length) return { x: rootR.x, y: rootR.y, width: rootR.width, height: rootR.height };
    const letzte = kinder[kinder.length - 1].getBoundingClientRect();
    const hoehe = Math.min(letzte.bottom - rootR.y + ${bottomPadding}, rootR.height);
    return { x: rootR.x, y: rootR.y, width: rootR.width, height: hoehe };
  `);
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
      return inhaltsBox(cdp, ".llm-lab-rate");
    },
  },
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp, base) {
      await seedRecords(cdp, base);
      if (!(await rateTabBereit(cdp, SEED_RECORDS.length))) return null;
      // Erste sichtbare Zeile auswaehlen — welcher der vier Beispieldatensaetze das ist,
      // haengt von der Sortierung der Bewerten-Ansicht ab (neueste zuerst), nicht von der
      // Seed-Reihenfolge oben. Der Vertrag verlangt nur "eine Zeile mit vollem
      // Prompt/Antwort-Detail darunter", nicht ein bestimmtes Beispiel.
      const ausgewaehlt = await cdp.evaluate<boolean>(`
        const zeile = document.querySelector(".llm-lab-zeile");
        if (!zeile) return false;
        zeile.click();
        return true;
      `);
      if (!ausgewaehlt) return null;
      // Gepollt statt fixer Pause: das Detail unter der Zeile rendert nach dem Klick
      // asynchron, ein fester 300ms-Schlaf war im Volllauf (nicht isoliert) beobachtbar
      // knapp zu kurz und lieferte einmalig ein 0x0-.llm-lab-rate.
      await pollUntil<boolean>(cdp, `
        const el = document.querySelector(".llm-lab-rate");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      `, 5_000, 200);
      return inhaltsBox(cdp, ".llm-lab-rate");
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
      // ".modal-content" allein liess den Titel ("Add detail to this rating") und den
      // X-Knopf aussen vor — beide sitzen in ".modal-header", einem Geschwister von
      // ".modal-content" unter ".modal". Der Vertrag verlangt das Modal MIT Titel.
      return boxOf(cdp, ".modal", PADDING);
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
    // `.vertical-tab-content` und seine Vorfahren (`.modal`,
    // `.vertical-tab-content-container`) sind auf die Fensterhoehe gedeckelt
    // (`overflow: hidden`, an `vh`-Prozentwerten der Modal-Groesse gemessen) — der
    // Bildschirm laesst das OS-Fenster aber nur bis 949px hoch werden ("durch den
    // Bildschirm begrenzt"), lange bevor der Inhalt (~1050px) hineinpasst.
    // `captureBeyondViewport` in `capture()` faengt nur den VIEWPORT ab, kein
    // `overflow: hidden` DARIN, und ein CSS-Override der drei Vorfahren aendert nichts
    // an dieser Fenstergrenze (gemessen: identischer Abschnitt blieb schwarz).
    // `Emulation.setDeviceMetricsOverride` laesst Chromium dagegen mit einem groesseren
    // VIRTUELLEN Viewport layouten, ohne das echte OS-Fenster zu vergroessern — die
    // `vh`-gebundenen `max-height`-Regeln rechnen dann gegen die virtuelle Hoehe und
    // geben den vollen Inhalt frei. `deviceScaleFactor: 2` erhaelt die native Retina-
    // Aufloesung dieses Fensters (gemessen `window.devicePixelRatio === 2` OHNE Override;
    // ein erster Versuch mit `deviceScaleFactor: 1` hatte sie ungewollt AUF 1 gesenkt und
    // eine zu schmale Datei erzeugt).
    await fenster.send("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 2000,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 400));
    // Nicht die Container-Box selbst vermessen: `.vertical-tab-content` waechst auf die
    // ANGEBOTENE virtuelle Hoehe (2000px), auch wenn der Inhalt viel kuerzer ist — eine
    // grosszuegige Override-Hoehe erzeugte deshalb ein Bild mit leerem schwarzen Rand
    // unten (gemessen: 1200x2358 bei ~1050px tatsaechlichem Inhalt). Vermessen wird
    // stattdessen die untere Kante des LETZTEN Kindelements, damit die Box genau am
    // Inhalt endet, unabhaengig von der gewaehlten virtuellen Fensterhoehe.
    const box = await fenster.evaluate<Rect | null>(`
      const root = document.querySelector(".vertical-tab-content");
      if (!root) return null;
      const kinder = [...root.children].filter((k) => {
        const r = k.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      });
      if (!kinder.length) return null;
      const rootR = root.getBoundingClientRect();
      const letzte = kinder[kinder.length - 1].getBoundingClientRect();
      return {
        x: rootR.x, y: rootR.y, width: rootR.width,
        height: Math.min(letzte.bottom - rootR.y, rootR.height),
      };
    `);
    if (!box) return "settings.png — kein Inhaltsbereich im Einstellungen-Fenster";
    const png = await capture(fenster, box, 1);
    return await writeShot(fenster, "settings.png", png, { ...opts, thumb: false });
  } finally {
    await fenster.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => undefined);
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
  // Ein Modal (z. B. von "rate-details.png") schliesst hier niemand aktiv — ein
  // abgebrochener Nachzieh-Lauf (Strg-C, Fehler) liess eines im DOM stehen und ein
  // Folgelauf nahm "hero.png" DAMIT auf statt der Bewerten-Ansicht dahinter.
  await cdp.evaluate(`
    for (const el of document.querySelectorAll(".modal-container")) el.remove();
    return true;
  `);

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
