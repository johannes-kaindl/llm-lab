/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Warum getrackt: dieselbe Begruendung wie bei `scripts/gui-smoke.ts`, mit dem sich dieser
 * Treiber die CDP-Bruecke UND das Fixture (`docs/images/fixture/`) teilt. Bruecke,
 * Aufnahme-Primitive und Fixture→Vault liegen zentral im Dach
 * (`obsidian-plugins/tools/obsidian-cdp/`), dieser Treiber importiert sie von dort.
 *
 * ## Zweitinstanz, Pflicht-Port (seit Welle 21)
 *
 * Aufgenommen wird in einer **Zweitinstanz** mit eigenem Profil und eigenem Port — nie in
 * der regulaeren Instanz (Port 9222), an der andere Sessions haengen koennen, und nie mit `quit`. Die
 * Bilder zeigen ohnehin den Staging-Vault mit Fixture (`$STAGING_VAULTS_DIR/llm-lab`), nicht den
 * Arbeits-Vault. Der Treiber hat keinen Standardport: `--port <n>` ist Pflicht (dokumentierter Wert
 * dieses Rezepts: 9437). Rezept der Zweitinstanz: Dach-`AGENTS.md` § Staging-Vaults.
 *
 * ```bash
 * UD=/tmp/obs-test-llm-lab; mkdir -p "$UD"
 * lsof -nP -iTCP:9437 -sTCP:LISTEN; pgrep -f "user-data-dir=$UD"      # beides leer, sonst ausweichen
 * cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 * # Vault "$STAGING_VAULTS_DIR/llm-lab" und "language":"en" in "$UD/obsidian.json" eintragen
 * npm run build && OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/llm-lab/.obsidian/plugins/llm-lab" npm run deploy
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9437 &
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label llm-lab --intent "shots.ts" --exclusive focus --port 9437 --ttl 600
 * ```
 *
 * ## Zweite Vorbedingung: Obsidians Oberflaeche auf Englisch
 *
 * Der Treiber PRUEFT `document.documentElement.lang` vor dem ersten Bild und bricht mit Klartext ab,
 * statt die Sprache umzustellen. In der Zweitinstanz steht sie ueber `obsidian.json` (`"language":"en"`)
 * und `localStorage.language`. S. `docs/images/README.md`.
 *
 * ## Ablauf
 *
 * ```bash
 * npm run shots -- --list                  # Vertrag anzeigen (ohne Port)
 * npm run shots -- --port 9437             # alle vier Bilder
 * npm run shots -- --port 9437 --only hero.png
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * `--setup` baut den Vault aus `docs/images/fixture/` neu (identisch mit `gui-smoke.ts --setup`);
 * ein Nachzieh-Lauf braucht es nicht, der Vault ist bereits gebaut. Die Zweitinstanz liest `obsidian.json`
 * nur beim Start.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

import {
  attachTo,
  Cdp,
  closeExtraLeaves,
  openExisting,
  pollUntil,
  requireUntil,
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
/** `hero.png`: in 900 px Fensterhöhe füllt das Detail der Bewerten-Zeile die Panelhöhe, und zwischen „980 ms“ und der Aktionsleiste (Good/Poor/…) bleibt eine leere
 *  Fläche aus identischen Zeilen (readme_lint `image-whitespace`, 26 % statt der erlaubten 25 %). Ein niedrigeres Fenster kürzt das Panel und damit die Leere, ohne
 *  etwas abzuschneiden: gemessen am vollen Lauf, siehe `docs/images/README.md`. */
const HERO_HOEHE = 760;
/** Anläufe für den Bestand von `hero.png` (siehe dort). */
const HERO_VERSUCHE = 3;
/** `rate-empty.png`: der Streifen (Filterleiste, eine Textzeile) trägt unter der Textzeile einen Rand aus identischen Zeilen; der Vorgabewert von `inhaltsBox`
 *  (16 px) ließ ihn bei 30 %. Ein kleinerer Rand kürzt nur diesen Rand, die Zeile bleibt ganz. */
const LEER_RAND = 3;
/** `rate-empty.png`: Breite des Fensters. Bei 1440 px ist der Leerzustand ein 103 px hoher Streifen, dessen längste Folge identischer Zeilen die Lücke zwischen Filterleiste und
 *  Textzeile ist (29 px, 28 %), und ein Zuschnitt macht sie nicht kürzer. Bei 1000 px bricht die Textzeile um (eine echte zweite Zeile, nichts gestaucht), der Streifen ist 213 px hoch
 *  und die längste Folge 52 px (24 %). */
const LEER_BREITE = 1000;

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
  await requireUntil(cdp, `(() => {
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    return !!(p && p.api);
  })()`, "llm-lab bietet nach dem Neuladen keine api an", 15_000, 500);
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
  await requireUntil(cdp, `(async () => {
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
  })()`, "Die geseedeten Trace-Zeilen sind nicht auf der Platte gelandet", 8_000, 200);
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
  /** Fensterhöhe für dieses Bild; ohne Angabe `FENSTER_HOEHE`. */
  hoehe?: number;
  /** Fensterbreite für dieses Bild; ohne Angabe `FENSTER_BREITE`. */
  breite?: number;
  run(cdp: Cdp, base: string): Promise<Rect | null>;
}

const SHOTS: Shot[] = [
  {
    // Zuerst, VOR dem Seeden: der Empty-State existiert nur, solange nichts angekommen ist.
    name: "rate-empty.png",
    klasse: "detail",
    breite: LEER_BREITE,
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
      return inhaltsBox(cdp, ".llm-lab-rate", LEER_RAND);
    },
  },
  {
    name: "hero.png",
    klasse: "hero",
    hoehe: HERO_HOEHE,
    async run(cdp, base) {
      // Das Seeden verliert gelegentlich eine Zeile in der Ansicht („3 von 4“, gemessen 2026-10-26 in vier von acht Läufen, die Platte trägt alle vier): bis zu
      // HERO_VERSUCHE Anläufe, jeder ab dem zweiten mit Rücksetzen, statt einen Lauf mit unvollständigem Bestand aufzunehmen.
      let bereit = false;
      for (let versuch = 1; versuch <= HERO_VERSUCHE && !bereit; versuch++) {
        if (versuch > 1) await zustandZuruecksetzen(cdp, base);
        await seedRecords(cdp, base);
        bereit = await rateTabBereit(cdp, SEED_RECORDS.length);
        if (!bereit) {
          const da = await cdp.evaluate<number>(`return document.querySelectorAll(".llm-lab-zeile").length;`);
          console.log(`      · Versuch ${versuch}: ${da} von ${SEED_RECORDS.length} Zeilen in der Bewerten-Ansicht`);
        }
      }
      if (!bereit) return null;
      // Die Zeile der Suche (koda-agent / search): ihr Detail ist das längste, und die vier Datensätze tragen denselben Zeitstempel auf die Minute,
      // so dass „die erste Zeile“ von Lauf zu Lauf eine andere wäre (ein kurzes Detail ließ unter der Antwort eine leere Fläche, 49 % statt 12 %).
      const ausgewaehlt = await cdp.evaluate<boolean>(`
        const zeile = [...document.querySelectorAll(".llm-lab-zeile")].find((z) => (z.textContent || "").includes("search"));
        if (!zeile) return false;
        zeile.click();
        return true;
      `);
      if (!ausgewaehlt) {
        console.log("      · keine Zeile zur Suche (koda-agent / search)");
        return null;
      }
      // Gepollt statt fixer Pause: das Detail unter der Zeile rendert nach dem Klick
      // asynchron, ein fester 300ms-Schlaf war im Volllauf (nicht isoliert) beobachtbar
      // knapp zu kurz und lieferte einmalig ein 0x0-.llm-lab-rate.
      await requireUntil(cdp, `(() => {
        const el = document.querySelector(".llm-lab-rate");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })()`, "Das Detail der Bewerten-Zeile rendert nicht", 5_000, 200);
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
      "\nDen Vault in $UD/obsidian.json der Zweitinstanz eintragen und sie neu starten;\n"
      + "die reguläre Instanz bleibt unberuehrt (Kopfkommentar dieses Rezepts).",
    );
    return;
  }

  // Der Port ist PFLICHT: ein Default 9222 traefe die reguelaere Instanz (Dach-AGENTS § Staging-Vaults).
  const portArg = flag("--port");
  const port = Number(portArg);
  if (portArg === undefined || !Number.isInteger(port)) {
    throw new Error("--port <n> fehlt. Dieses Rezept hat keinen Standardport; die Zweitinstanz-Anleitung steht im Dateikopf.");
  }
  const nur = flag("--only");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n`
      + "Laeuft die Zweitinstanz mit --remote-debugging-port und traegt $UD/obsidian.json den Vault?",
    );
  }
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));

  await cdp.send("Page.bringToFront");
  await new Promise((r) => setTimeout(r, 2000));

  // Aufnahmesprache PRUEFEN, nicht setzen — sie ist app-weit und wirkt erst nach einem Neustart.
  const lang = await cdp.evaluate<string>(`return document.documentElement.lang || "";`);
  if (lang && !lang.startsWith("en")) {
    throw new Error(
      `Obsidians Oberflaeche laeuft auf "${lang}", der Bildvertrag verlangt Englisch.\n`
      + "  In der Zweitinstanz: \"language\":\"en\" in $UD/obsidian.json und localStorage.language, dann neu starten.",
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
      await setWindowSize(cdp, shot.breite ?? FENSTER_BREITE, shot.hoehe ?? FENSTER_HOEHE);
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
