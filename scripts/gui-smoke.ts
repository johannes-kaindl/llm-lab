/**
 * GUI-Smoke-Treiber — faehrt die Abnahme-Pruefpunkte gegen ein **laufendes** Obsidian
 * statt von Hand (CORE-TEST-02 b).
 *
 * Warum dieses Repo ihn besonders braucht: Slice 1 hat 56 gruene Unit-Tests, aber der
 * **Datei-Weg** (`src/obsidian/vault_sink.ts`) ist gegen einen Mock gar nicht pruefbar —
 * er ist die duenne Naht zu Obsidians `DataAdapter`, und genau dieser Adapter hat sich im
 * Workspace zweimal anders verhalten als seine Typdefinition versprach (`rmdir(path,false)`
 * loeschte nichts, `writeBinary` kuerzte die Zieldatei). Die groessenbasierte Rotation haengt
 * daran, dass `adapter.stat()` fuer eine Datei unter `.obsidian/` ein `size` liefert; tut sie
 * das nicht, faellt der Code auf `0` zurueck, die Summe ist immer 0, die Grenze greift nie —
 * und **nichts geht dabei kaputt, es waechst nur still**. Das ist mit Unit-Tests strukturell
 * nicht zu finden.
 *
 * Der Treiber spielt dabei den **Konsumenten selbst** (`api.log(...)` aus dem Renderer),
 * statt ein Nachbarplugin und einen LLM-Endpunkt vorauszusetzen. Das ist kein Ersatz fuer die
 * Abnahme der vault-rag-Verdrahtung, sondern deren Voraussetzung: was hier rot ist, ist im
 * Lab kaputt und nicht in der Verdrahtung.
 *
 * ## Voraussetzung
 *
 * Obsidian muss mit offenem Debug-Port laufen — der einzige Handgriff, der Handarbeit
 * bleibt, weil die App dafuer neu starten muss:
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Der Aufnahme-Vault wird aus dem getrackten Fixture gebaut (`docs/images/fixture/`):
 *
 * ```bash
 * export STAGING_VAULTS_DIR="$HOME/StagingVaults"
 * npm run build && npm run smoke:gui -- --setup      # Vault bauen, danach Obsidian oeffnen
 * npm run smoke:gui -- --vault llm-lab               # Lauf
 * ```
 *
 * `--vault` matcht exakt gegen `app.vault.getName()` (den Vault-**Ordnernamen**), nicht als
 * Teilstring des Fenstertitels.
 *
 * ## Was der Lauf veraendert — und zurueckgibt
 *
 * Er schreibt Trace-Zeilen (das ist der Gegenstand), legt zwei **erfundene alte**
 * Trace-Dateien an, um die Rotation ueberhaupt ausloesen zu koennen, und dreht waehrend der
 * Pruefpunkte an `enabled`, `maxBytes` und `redactPiiInTrace`. Der Vorwert der Einstellungen
 * wird VOR dem ersten Eingriff gelesen, im Klartext protokolliert (damit ein Ctrl-C
 * rekonstruierbar bleibt — das `finally` laeuft dann naemlich nicht mehr) und am Ende
 * zurueckgeschrieben. Das Zurueckschreiben wird **gegen die Datei** verifiziert, nicht gegen
 * das Objekt im Speicher: ein Aufraeumer, der sichtbar aufraeumt und die `data.json` nicht
 * anfasst, ist der teuerste Fehlerfall (Lesson json_viewer 2026-08-22).
 *
 * Die vom Lauf erzeugten Trace-Dateien werden am Ende entfernt — sie sind Testfixtur, keine
 * Aufzeichnung. `--keep` laesst beides stehen.
 *
 * Die CDP-Bruecke liegt zentral im Dach (`tools/obsidian-cdp/`) und wird importiert, nicht
 * vendored. Fehlt das Dach (fremder Checkout), bricht esbuild beim Aufloesen ab — das ist die
 * gewollte Meldung. Was ihr fehlt, wird DORT ergaenzt, nicht hier nachgebaut.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Cdp, attachTo, pollUntil, releaseAlwaysOnTop, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "llm-lab";
const REPO_NAME = "llm-lab";
/** Muessen zu `setIcon(...)` in `main.ts::renderStatus` passen. */
const ICON_RECORDING = "circle-dot";
const ICON_PAUSED = "pause-circle";
/** Muss zu `excludedFeatures` in `DEFAULT_SETTINGS` passen. */
const EXCLUDED_FEATURE = "settings-probe";

// --- Pruefpunkte ------------------------------------------------------------

interface Check { name: string; passed: boolean; detail: string }
const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function skip(name: string, grund: string): void {
  console.log(`  – ${name}: uebersprungen — ${grund}`);
}

/** UTC-Tag, genau wie `main.ts` ihn bildet (`new Date().toISOString().slice(0,10)`).
 *  Lokale Zeit waere hier falsch: der Store schreibt nach UTC-Datum, und um 01:30 CEST
 *  wuerde ein lokal gerechneter Treiber die Datei von morgen suchen. */
function utcDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(name);

interface Settings {
  enabled: boolean;
  keepDays: number;
  maxBytes: number;
  excludedFeatures: string[];
  customPiiTerms: string[];
  redactPiiInTrace: boolean;
  excludedFolders: string[];
  strictFolderExclusion: boolean;
}

async function main(): Promise<void> {
  const port = Number(arg("--port") ?? 9222);
  const vaultName = arg("--vault") ?? REPO_NAME;
  const keep = flag("--keep");
  const repoRoot = process.cwd();
  const vaultDir = process.env.SMOKE_VAULT_DIR ?? stagingVaultDir(REPO_NAME);

  if (flag("--setup")) {
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, "docs/images/fixture"),
      pluginId: PLUGIN_ID,
    })) console.log(`  ${zeile}`);
    console.log(`\nVault gebaut: ${vaultDir}\nJetzt Obsidian mit diesem Vault oeffnen, dann ohne --setup erneut starten.`);
    return;
  }

  // Deploy-Abgleich VOR dem Verbinden: ein Lauf gegen den vorigen Stand meldet Erfolg und
  // misst die falsche Fassung — der teuerste stille Fehlschlag dieses Werkzeugs (Lesson
  // vault-rag 2026-08-21, fing beim ersten Einsatz sofort den realen Fall). Er ersetzt
  // `npm run build` nicht, nur das Vergessen des Kopierens (Lesson json_viewer).
  const hash = (p: string): string | null => {
    try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { return null; }
  };
  const abweichend = ["main.js", "manifest.json", "styles.css"].filter(
    (f) => hash(join(repoRoot, f)) !== hash(join(vaultDir, ".obsidian/plugins", PLUGIN_ID, f)),
  );
  if (abweichend.length && !flag("--ignore-deploy")) {
    throw new Error(
      `Der Vault traegt einen anderen Stand als der Arbeitsbaum (${abweichend.join(", ")}).\n`
      + `  npm run build && OBSIDIAN_PLUGIN_DIR="${vaultDir}/.obsidian/plugins/${PLUGIN_ID}" npm run deploy\n`
      + "Danach das Plugin im laufenden Obsidian aus- und wieder einschalten. (--ignore-deploy uebergeht das.)",
    );
  }

  const cdp = await attachTo("workspace", port, vaultName);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster fuer Vault "${vaultName}" auf Port ${port}.\n`
      + "  osascript -e 'quit app \"Obsidian\"' && open -a Obsidian --args --remote-debugging-port=9222",
    );
  }
  // Ein Fenster im Hintergrund liefert einen leeren DOM, waehrend die App-API korrekt
  // antwortet — man debuggt dann ein Phantom.
  await requireVisible(cdp);

  const heute = utcDay();
  const gestern = utcDay(-1);
  const uralt = utcDay(-30);

  let savedSettings: Settings | null = null;
  let angelegteDateien: string[] = [];

  try {
    const vorhanden = await cdp.evaluate<{ ok: boolean; version?: string; dir?: string; lang?: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (!p) return { ok: false };
      return {
        ok: true,
        version: p.manifest.version,
        dir: p.manifest.dir || ".obsidian/plugins/" + p.manifest.id,
        lang: document.documentElement.lang || "en",
      };
    `);
    if (!vorhanden.ok) {
      throw new Error(`Plugin "${PLUGIN_ID}" ist im Vault "${vaultName}" nicht aktiv — in den Community-Plugins einschalten.`);
    }

    // Der Hash-Guard oben vergleicht nur DATEIEN (Arbeitsbaum vs. Vault), nicht was Obsidian
    // gerade GELADEN hat: das Plugin-Objekt im laufenden Fenster stammt vom letzten
    // enablePlugin (typischerweise Vault-Oeffnen), nicht vom letzten Deploy. Ohne diesen
    // Reload hier pruefen die fruehen Punkte (allen voran Pruefpunkt 1, der Vertrag) also
    // moeglicherweise einen VERALTETEN Plugin-Stand, obwohl main.js laengst aktuell ist —
    // gemessen 2026-08-23: apiVersion 1 im geladenen Objekt, obwohl main.js bereits
    // apiVersion 2 baute. Der Reload-Mechanismus selbst ist derselbe wie in Pruefpunkt 4
    // weiter unten (disablePlugin/enablePlugin + pollUntil auf status()) — hier zieht er nur
    // vor den ersten inhaltlichen Pruefpunkt.
    await cdp.evaluate(`
      await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
      await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    await pollUntil<{ recording: boolean } | null>(cdp, `
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return p && p.api ? p.api.status() : null;
    `, 15_000, 500);

    const base = vorhanden.dir as string;
    const tracesDir = `${base}/traces`;
    const heuteDatei = `${tracesDir}/${heute}.jsonl`;
    // Die Sprache ist app-weit und gehoert dem Nutzer, nicht dem Lauf: statt sie zu stellen,
    // haelt der Treiber BEIDE zulaessigen Ergebnisse offen (Falle "ein Pruefpunkt kennt nur
    // einen richtigen Ausgang"). Gelesen wird die GELADENE Sprache (documentElement.lang),
    // nicht localStorage — das ist die Einstellung fuer den naechsten Start.
    const de = (vorhanden.lang ?? "en").startsWith("de");
    const TEXT_RECORDING = de ? "Lab: schreibt mit" : "Lab: recording";
    const TEXT_PAUSED = de ? "Lab: pausiert" : "Lab: paused";
    console.log(`\nLLM Lab ${vorhanden.version} · Vault ${vaultName} · Oberflaeche ${de ? "de" : "en"} · Tag ${heute}\n`);

    // --- 1. Der oeffentliche Vertrag ----------------------------------------
    // Die Zusage, die kein Unit-Test des Repos pruefen kann: dass sie am LEBENDEN
    // Plugin-Objekt haengt, das ein Nachbarplugin per Objekt-Lookup findet.
    const vertrag = await cdp.evaluate<{ apiVersion: unknown; recording: unknown; logTyp: string; ergebnisTyp: string }>(`
      const api = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api;
      const st = api.status();
      // log() muss SYNCHRON eine id liefern. Ein Promise waere hier genauso "wahr" und
      // wuerde jeden Konsumenten zu einem await im Antwortpfad zwingen — deshalb wird der
      // TYP gemessen, nicht die Wahrheit des Rueckgabewerts.
      const r = api.log({ plugin: "smoke", feature: "contract-probe", model: "m",
        endpointUrl: "http://127.0.0.1:1234/v1/chat/completions",
        messages: [{ role: "user", content: "ping" }], content: "pong", latencyMs: 1 });
      return { apiVersion: api.apiVersion, recording: st.recording, logTyp: typeof api.log, ergebnisTyp: typeof r };
    `);
    // Der Treiber ist selbst ein Konsument dieses Vertrags — genau wie vault-rags
    // `lab_client.ts` traegt er die apiVersion als eigene Kopie und muss bei jedem Bump von
    // `LLM_LAB_API_VERSION` (src/plugin_api.ts) manuell nachziehen. Stand: 3 (seit dem Bump vom
    // 2026-08-30, "feat(api)!: apiVersion 3 — promptTemplate auf LabLogInput"). Vorher 2 (431c23c).
    record("Anbieter-Vertrag haengt am Plugin-Objekt (apiVersion, status, log)",
      vertrag.apiVersion === 3 && vertrag.recording === true && vertrag.logTyp === "function",
      `apiVersion ${String(vertrag.apiVersion)} · recording ${String(vertrag.recording)}`);
    record("log() gibt die id SYNCHRON zurueck (kein Promise)",
      vertrag.ergebnisTyp === "string",
      `typeof log(...) = ${vertrag.ergebnisTyp}`);

    // --- 2. Statusleiste: Icon UND Text -------------------------------------
    // Der Icon-Name ist der Punkt: ein in Obsidians gebuendeltem Lucide unbekannter Name
    // rendert **still nichts**, und der Zustand haengt dann nur noch an der Farbe (WCAG 1.4.1).
    const leseStatus = `
      const el = [...document.querySelectorAll(".status-bar-item")]
        .find(e => /Lab:/.test(e.textContent || ""));
      if (!el) return { da: false };
      const svg = el.querySelector("svg");
      return {
        da: true,
        text: (el.textContent || "").trim(),
        iconKlasse: svg ? (svg.getAttribute("class") || "") : null,
        iconSichtbar: svg ? svg.getClientRects().length > 0 : false,
      };
    `;
    interface StatusEl { da: boolean; text?: string; iconKlasse?: string | null; iconSichtbar?: boolean }
    const st1 = await cdp.evaluate<StatusEl>(leseStatus);
    record("Statusleiste zeigt Zustand als Icon UND Text",
      st1.da === true && st1.text === TEXT_RECORDING
        && Boolean(st1.iconKlasse?.includes(ICON_RECORDING)) && st1.iconSichtbar === true,
      st1.da ? `„${st1.text}" · ${st1.iconKlasse || "kein svg"}` : "kein Statusleisten-Eintrag gefunden");

    // --- 3. Pause-Command ----------------------------------------------------
    const toggle = async (): Promise<StatusEl> => {
      await cdp.evaluate(`app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":toggle-pause")}); await new Promise(r => setTimeout(r, 200)); return true;`);
      return cdp.evaluate<StatusEl>(leseStatus);
    };
    const stPause = await toggle();
    const recPause = await cdp.evaluate<boolean>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api.status().recording;`);
    record("Pause-Command schaltet Icon, Text und status().recording um",
      stPause.text === TEXT_PAUSED && Boolean(stPause.iconKlasse?.includes(ICON_PAUSED)) && recPause === false,
      `„${stPause.text}" · ${stPause.iconKlasse || "kein svg"} · recording ${String(recPause)}`);

    // Waehrend der Pause darf nichts geschrieben werden — der Weg dorthin ist derselbe
    // Aufruf, den ein Konsument macht, nicht ein Blick auf `shouldLog`.
    const zeilenBei = async (): Promise<number> => Number(await cdp.evaluate<number>(`
      if (!(await app.vault.adapter.exists(${JSON.stringify(heuteDatei)}))) return 0;
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).length;
    `));
    const logRuf = (feature: string, extra = "{}"): string => `
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api.log(Object.assign({
        plugin: "smoke", feature: ${JSON.stringify(feature)}, model: "test-model",
        endpointUrl: "http://127.0.0.1:1234/v1/chat/completions",
        messages: [{ role: "system", content: "You are a test." }, { role: "user", content: "hello" }],
        content: "hi", latencyMs: 42
      }, ${extra}));
    `;
    const vorPause = await zeilenBei();
    await cdp.evaluate(logRuf("paused-probe"));
    await new Promise((r) => setTimeout(r, 600));
    const nachPause = await zeilenBei();
    record("Pausiert schreibt log() nichts",
      nachPause === vorPause, `${vorPause} → ${nachPause} Zeilen`);

    const stZurueck = await toggle();
    record("Pause laesst sich zurueckschalten",
      stZurueck.text === TEXT_RECORDING, `„${stZurueck.text}"`);

    // --- 4. Pause ist Sitzungszustand, keine Einstellung ---------------------
    // Zwei Haelften, weil eine allein nichts beweist: die Pause darf NICHT in data.json
    // landen (sonst laeuft jemand wochenlang stumm mit), und nach einem Neuladen muss der
    // Zustand wieder "schreibt mit" sein.
    await toggle(); // erneut pausieren, dann neu laden
    const persistiert = await cdp.evaluate<boolean>(`
      const roh = await app.vault.adapter.read(${JSON.stringify(base + "/data.json")}).catch(() => "{}");
      return Object.prototype.hasOwnProperty.call(JSON.parse(roh || "{}"), "paused");
    `);
    await cdp.evaluate(`
      await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
      await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    const nachReload = await pollUntil<{ recording: boolean }>(cdp, `
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return p && p.api ? p.api.status() : null;
    `, 15_000, 500);
    record("Pause ueberlebt einen Neustart NICHT (Sitzungszustand, nicht persistiert)",
      persistiert === false && nachReload?.recording === true,
      `data.json traegt "paused": ${String(persistiert)} · nach Reload recording ${String(nachReload?.recording)}`);

    // --- 5. Der Datei-Weg: schreibt log() wirklich auf die Platte? ----------
    // Die einzige Stelle, die gegen einen Mock nicht pruefbar ist. Gewartet wird auf das
    // ERSCHEINEN der id, nicht auf eine Sekundenzahl: `write()` ist fire-and-forget.
    savedSettings = await cdp.evaluate<Settings>(`
      return JSON.parse(JSON.stringify(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings));
    `);
    console.log(`  (Einstellungen gesichert: ${JSON.stringify(savedSettings)})`);

    const id = await cdp.evaluate<string>(logRuf("chat"));
    const zeile = await pollUntil<string>(cdp, `
      if (!(await app.vault.adapter.exists(${JSON.stringify(heuteDatei)}))) return null;
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      const treffer = t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(id)}));
      return treffer || null;
    `, 15_000, 500);
    let satz: Record<string, unknown> | null = null;
    try { satz = zeile ? (JSON.parse(zeile) as Record<string, unknown>) : null; } catch { satz = null; }
    record("log() landet als JSONL-Zeile im Vault (der ungetestete Datei-Weg)",
      satz !== null && satz.id === id && satz.feature === "chat" && satz.plugin === "smoke",
      satz ? `${heuteDatei} · feature ${String(satz.feature)} · host ${String(satz.endpointHost)}` : "keine Zeile mit der zurueckgegebenen id");
    record("Der Endpunkt landet als Host+Port, ohne Pfad und Query",
      satz?.endpointHost === "127.0.0.1:1234",
      `endpointHost ${JSON.stringify(satz?.endpointHost ?? null)}`);

    // --- 6. stat().size — der Punkt, an dem die Rotation haengt --------------
    const groesse = await cdp.evaluate<{ typ: string; size: unknown }>(`
      const s = await app.vault.adapter.stat(${JSON.stringify(heuteDatei)});
      return { typ: s === null ? "null" : typeof s.size, size: s ? s.size : null };
    `);
    record("adapter.stat() liefert fuer eine Datei unter .obsidian/ eine echte Groesse",
      groesse.typ === "number" && Number(groesse.size) > 0,
      `size = ${JSON.stringify(groesse.size)} (${groesse.typ})`);

    // --- 7./8. Rotation, gemessen als Wirkung ------------------------------
    // Nicht `planRotation` (die ist unit-getestet), sondern die Kette adapter.list →
    // adapter.stat → planRotation → adapter.remove. Ausgeloest wird sie ueber den echten
    // Weg (ein log()), nicht ueber einen direkten Aufruf des Store.
    const altDatei = `${tracesDir}/${gestern}.jsonl`;
    const uraltDatei = `${tracesDir}/${uralt}.jsonl`;
    angelegteDateien = [altDatei, uraltDatei];
    await cdp.evaluate(`
      const fuellung = "x".repeat(5000) + "\\n";
      await app.vault.adapter.write(${JSON.stringify(altDatei)}, fuellung);
      await app.vault.adapter.write(${JSON.stringify(uraltDatei)}, "alt\\n");
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // keepDays bleibt auf dem Vorwert (7) — die uralte Datei faellt darueber. maxBytes
      // wird unter die Fuellung gedrueckt, damit die GESTRIGE Datei nur ueber die Groesse
      // fallen kann: sie liegt innerhalb von keepDays, die Altersregel fasst sie nicht an.
      p.settings.maxBytes = 2000;
      await p.saveSettings();
      return true;
    `);
    await cdp.evaluate(logRuf("rotation-trigger"));
    const rotiert = await pollUntil<{ alt: boolean; uralt: boolean; heute: boolean }>(cdp, `
      const a = await app.vault.adapter.exists(${JSON.stringify(altDatei)});
      const u = await app.vault.adapter.exists(${JSON.stringify(uraltDatei)});
      const h = await app.vault.adapter.exists(${JSON.stringify(heuteDatei)});
      return (!a && !u) ? { alt: a, uralt: u, heute: h } : null;
    `, 20_000, 700);
    const standRotation = rotiert ?? await cdp.evaluate<{ alt: boolean; uralt: boolean; heute: boolean }>(`
      return {
        alt: await app.vault.adapter.exists(${JSON.stringify(altDatei)}),
        uralt: await app.vault.adapter.exists(${JSON.stringify(uraltDatei)}),
        heute: await app.vault.adapter.exists(${JSON.stringify(heuteDatei)}),
      };
    `);
    record("Groessenbasierte Rotation raeumt wirklich weg (haengt an stat().size)",
      standRotation.alt === false,
      standRotation.alt ? `${gestern}.jsonl steht noch — genau der stille Fehlerfall` : `${gestern}.jsonl entfernt`);
    record("Altersbasierte Rotation raeumt wirklich weg",
      standRotation.uralt === false,
      standRotation.uralt ? `${uralt}.jsonl steht noch` : `${uralt}.jsonl entfernt`);
    record("Die heutige Datei ueberlebt jede Rotation",
      standRotation.heute === true,
      standRotation.heute ? "vorhanden" : "geloescht — die Datei, in die gerade geschrieben wird");

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.maxBytes = ${savedSettings.maxBytes};
      await p.saveSettings();
      return true;
    `);

    // --- 9. Ausschlussliste --------------------------------------------------
    const vorAusschluss = await zeilenBei();
    await cdp.evaluate(logRuf(EXCLUDED_FEATURE));
    await new Promise((r) => setTimeout(r, 600));
    const nachAusschluss = await zeilenBei();
    record(`Ausgeschlossenes Feature ("${EXCLUDED_FEATURE}") wird nicht mitgeschrieben`,
      nachAusschluss === vorAusschluss, `${vorAusschluss} → ${nachAusschluss} Zeilen`);

    // --- 10. Der Hauptschalter ----------------------------------------------
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.enabled = false; await p.saveSettings(); return true;
    `);
    const vorAus = await zeilenBei();
    await cdp.evaluate(logRuf("disabled-probe"));
    await new Promise((r) => setTimeout(r, 600));
    const nachAus = await zeilenBei();
    const statusAus = await cdp.evaluate<boolean>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api.status().recording;`);
    record("Ausgeschaltet wird gar nichts geschrieben, und status() sagt das auch",
      nachAus === vorAus && statusAus === false, `${vorAus} → ${nachAus} Zeilen · recording ${String(statusAus)}`);
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.enabled = true; await p.saveSettings(); return true;
    `);

    // --- 11. Bearer-Maskierung, die einzige real wirksame Schluessel-Regel ---
    // Slice 1 verdrahtet `secrets: () => []` — was hier greift, ist das fest
    // einprogrammierte BEARER-Muster. Der Pruefpunkt belegt genau diese Reichweite,
    // statt eine Zusage zu behaupten, die das Repo selbst als Luecke fuehrt.
    const token = "sk-smoke-0123456789abcdef";
    const bearerId = await cdp.evaluate<string>(logRuf("bearer-probe",
      `{ content: "upstream said: Authorization: Bearer ${token} (401)" }`));
    const bearerZeile = await pollUntil<string>(cdp, `
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(bearerId)})) || null;
    `, 15_000, 500);
    record("Ein Bearer-Token im aufgezeichneten Text wird maskiert",
      Boolean(bearerZeile) && !bearerZeile?.includes(token) && Boolean(bearerZeile?.includes("Bearer ••••")),
      bearerZeile ? (bearerZeile.includes(token) ? "Token steht im Klartext auf der Platte" : "Bearer •••• geschrieben") : "keine Zeile gefunden");

    // --- 11b. Aufruf-Schluessel: exakte Maskierung (die Slice-1-Luecke) -----
    const apiKey = "sk-smoke-endpunkt-9876543210";
    const keyId = await cdp.evaluate<string>(logRuf("secret-probe",
      `{ secrets: ["${apiKey}"], content: "der Server antwortete mit ${apiKey}" }`));
    const keyZeile = await pollUntil<string>(cdp, `
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(keyId)})) || null;
    `, 15_000, 500);
    record("Ein per log() mitgelieferter Endpunkt-Schluessel wird exakt maskiert",
      Boolean(keyZeile) && !keyZeile?.includes(apiKey) && Boolean(keyZeile?.includes("••••")),
      keyZeile ? (keyZeile.includes(apiKey) ? "Schluessel steht im Klartext auf der Platte" : "maskiert") : "keine Zeile gefunden");

    record("Der mitgelieferte Schluessel steht selbst nicht im Record",
      Boolean(keyZeile) && !keyZeile?.includes("secrets"),
      keyZeile?.includes("secrets") ? "Feld `secrets` auf der Platte" : "kein secrets-Feld");

    // --- 11c. Ordner-Filter: erst die Gegenprobe, dann die Abwesenheit ------
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.excludedFolders = ["Privat"];
      p.settings.strictFolderExclusion = true;
      await p.saveSettings(); return true;
    `);

    // Gegenprobe zuerst: ein NICHT ausgeschlossener Pfad muss ankommen — sonst
    // beweist die Abwesenheit darunter nur, dass gerade gar nichts geschrieben wird.
    const offenId = await cdp.evaluate<string>(logRuf("folder-open",
      `{ contextPaths: ["Notizen/oeffentlich.md"] }`));
    const offenZeile = await pollUntil<string>(cdp, `
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(offenId)})) || null;
    `, 15_000, 500);
    record("Ein Pfad ausserhalb der ausgeschlossenen Ordner wird mitgeschrieben",
      Boolean(offenZeile), offenZeile ? "Zeile geschrieben" : "keine Zeile — der Filter greift zu breit");

    const vorFilter = await zeilenBei();
    await cdp.evaluate(logRuf("folder-blocked", `{ contextPaths: ["Privat/Tagebuch.md"] }`));
    await new Promise((r) => setTimeout(r, 600));
    const nachFilter = await zeilenBei();
    record("Ein Pfad aus einem ausgeschlossenen Ordner erzeugt keinen Record",
      nachFilter === vorFilter, `${vorFilter} → ${nachFilter} Zeilen`);

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.excludedFolders = []; await p.saveSettings(); return true;
    `);

    // --- 12. PII: aus per Default, record-weit konsistent wenn an -----------
    const mail = "smoke.person@example.org";
    const klartextId = await cdp.evaluate<string>(logRuf("pii-default",
      `{ messages: [{ role: "user", content: "write to ${mail}" }], content: "sent to ${mail}" }`));
    const klartextZeile = await pollUntil<string>(cdp, `
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(klartextId)})) || null;
    `, 15_000, 500);
    record("PII steht per Default im rohen Trace (dokumentierte Asymmetrie, keine Luecke)",
      Boolean(klartextZeile?.includes(mail)),
      klartextZeile?.includes(mail) ? "E-Mail im Klartext, wie dokumentiert" : "maskiert — Default oder Doku stimmt nicht");

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.redactPiiInTrace = true; await p.saveSettings(); return true;
    `);
    const piiId = await cdp.evaluate<string>(logRuf("pii-probe",
      `{ messages: [{ role: "user", content: "write to ${mail}" }], content: "sent to ${mail}" }`));
    const piiZeile = await pollUntil<string>(cdp, `
      const t = await app.vault.adapter.read(${JSON.stringify(heuteDatei)});
      return t.split("\\n").filter(Boolean).find(l => l.includes(${JSON.stringify(piiId)})) || null;
    `, 15_000, 500);
    // Der eigentliche Punkt ist nicht "maskiert", sondern "ueberall DERSELBE Platzhalter":
    // eine feldweise Zaehlung faenge in jedem Feld neu bei _1 an, und ein daraus
    // trainiertes Modell lernte, aus einem Platzhalter beliebige neue Daten zu erfinden.
    const platzhalter = piiZeile ? [...piiZeile.matchAll(/\[EMAIL_\d+\]/g)].map((m) => m[0]) : [];
    record("PII-Maskierung wirkt und vergibt record-weit denselben Platzhalter",
      Boolean(piiZeile) && !piiZeile?.includes(mail) && platzhalter.length >= 2 && new Set(platzhalter).size === 1,
      piiZeile ? `${platzhalter.length}× ${[...new Set(platzhalter)].join(", ") || "kein Platzhalter"}` : "keine Zeile gefunden");

    // --- 13. Einstellungs-Tab: die inhaltlich verbindlichen Zeilen -----------
    // Reihenfolge ist hier Inhalt, nicht Kosmetik: der Schalter ist der einzige Aktivator
    // des Felds darunter und per Default aus. Steht er darunter, tippt jemand einen Namen
    // in ein Feld, das nichts tut, und haelt sich fuer geschuetzt.
    await cdp.evaluate(`app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); await new Promise(r => setTimeout(r, 700)); return true;`);
    let tabCdp: Cdp | null = cdp;
    let tab = await cdp.evaluate<{ da: boolean; namen?: string[]; ortText?: string; grenzenSichtbar?: boolean; filterGrenzenSichtbar?: boolean }>(TAB_LESEN(base));
    if (!tab.da) {
      // Ab Obsidian 1.13 sind die Einstellungen ein eigenes FENSTER — dann ist das Modal im
      // Workspace-Dokument nicht zu finden, und das sieht wie ein Plugin-Defekt aus.
      const settingsCdp = await attachTo("settings", port);
      if (settingsCdp) { tabCdp = settingsCdp; tab = await settingsCdp.evaluate(TAB_LESEN(base)); }
    }
    if (!tab.da) {
      skip("Einstellungs-Tab", "weder Modal noch Einstellungs-Fenster gefunden");
    } else {
      const namen = tab.namen ?? [];
      const iSchalter = namen.findIndex((n) => /raw trace|rohen Trace/i.test(n));
      const iBegriffe = namen.findIndex((n) => /terms to mask|Begriffe maskieren/i.test(n));
      record("Der PII-Schalter steht UEBER dem Feld, das nur mit ihm wirkt",
        iSchalter >= 0 && iBegriffe >= 0 && iSchalter < iBegriffe,
        `Reihenfolge: ${namen.join(" | ")}`);
      record("Eine eigene Zeile nennt den Ablageort im Klartext",
        Boolean(tab.ortText?.includes(base)),
        tab.ortText ? `„${tab.ortText.slice(0, 90)}"` : "keine Ablageort-Zeile");
      record("Die Grenzen der Maskierung stehen sichtbar im Tab",
        tab.grenzenSichtbar === true,
        tab.grenzenSichtbar ? "Absatz sichtbar" : "Absatz fehlt oder ist unsichtbar");
      // Die drei Zeilen des Ordner-Filters (Slice 2), namentlich nachgewiesen — nicht nur
      // ueber defs.length > 0, das gruen bliebe, wuerden sie aus getSettingDefinitions()
      // verschwinden. Nativer Pfad hier; der Fallback-Pfad folgt unten in 13b nach
      // tab.display().
      record("excludedFolders-Zeile steht am nativen Pfad",
        namen.some((n) => /Never record notes from these folders|Notizen aus diesen Ordnern nie mitschreiben/.test(n)),
        `Zeilen: ${namen.join(" | ")}`);
      record("strictFolderExclusion-Zeile steht am nativen Pfad",
        namen.some((n) => /Strict folder exclusion|Strenger Ordner-Ausschluss/.test(n)),
        `Zeilen: ${namen.join(" | ")}`);
      record("Die render-Hatch der Ordner-Filter-Grenzen steht sichtbar im nativen Pfad",
        tab.filterGrenzenSichtbar === true,
        tab.filterGrenzenSichtbar ? "Absatz sichtbar" : "Absatz fehlt oder ist unsichtbar");
    }
    // --- 13b. Deklarative Settings-API: der Store-Posten und was er dem Nutzer bringt ---
    // Gemessen wird im HAUPTfenster, auch wenn die Einstellungen ab 1.13 in einem eigenen
    // Fenster stehen: dort kennt der JS-Kontext kein `app` (yijing-oracle 2026-08-16). Die
    // Element-Objekte sind vom Hauptfenster aus trotzdem erreichbar — `tab.containerEl`
    // zeigt auf das andere Dokument, `app.setting.containerEl` bliebe leer.
    const deklarativ = await cdp.evaluate<{
      da: boolean; defs?: number; uebernommen?: number; nativeZeilen?: number;
      fallbackZeilen?: number; suchbegriff?: string | null;
      mbGelesen?: number; mbGespeichert?: number; ungueltigVerworfen?: boolean;
      fallbackNamen?: string[]; fallbackFilterSichtbar?: boolean;
    }>(`
      const tab = app.setting.activeTab
        ?? (app.setting.pluginTabs || []).find(t => t.id === ${JSON.stringify(PLUGIN_ID)});
      if (!tab || typeof tab.getSettingDefinitions !== "function") return { da: false };

      const defs = tab.getSettingDefinitions();
      // Was der HOST uebernommen hat, nicht was das Plugin anbietet — genau darauf sieht
      // die Einstellungs-Suche. settingItems ist der Cache, den der Host beim Registrieren
      // aus getSettingDefinitions() zieht.
      const uebernommen = Array.isArray(tab.settingItems) ? tab.settingItems.length : 0;
      const nativeZeilen = tab.containerEl.querySelectorAll(".setting-item").length;

      // Suchbegriff aus der EIGENEN Definition ableiten, nie als feste Zeichenkette:
      // sonst misst der Punkt die UI-Sprache statt die Auffindbarkeit. Fehlt der Begriff,
      // ist das ein Defekt und kein Grund zum Ueberspringen (vault-crews 2026-08-17).
      const ersterName = (defs.find(d => typeof d.name === "string" && d.name.length > 3) || {}).name || null;

      // Der Fallback-Pfad (< 1.13) laeuft im Alltag NIE — ohne diesen Aufruf bliebe er
      // ungeprueft und drifted still von der Definitionsliste weg.
      tab.display();
      const fallbackZeilen = tab.containerEl.querySelectorAll(".setting-item").length;
      // Dieselben drei Ordner-Filter-Zeilen wie am nativen Pfad, jetzt gegen den
      // display()-Fallback gelesen — namentlich, nicht nur als Zeilenzahl.
      const fallbackNamen = [...tab.containerEl.querySelectorAll(".setting-item-name")]
        .map(e => (e.textContent || "").trim()).filter(Boolean);
      const fallbackFilterAbsatz = [...tab.containerEl.querySelectorAll(".setting-item-description")]
        .find(p => /folder filter can and cannot see|Ordner-Filter sieht und was nicht|filter only applies to calls|Filter greift nur bei Aufrufen/i.test(p.textContent || ""));
      const fallbackFilterSichtbar = fallbackFilterAbsatz ? fallbackFilterAbsatz.getClientRects().length > 0 : false;

      // Die MB↔Byte-Uebersetzung existiert nur im Host (getControlValue/setControlValue)
      // und in keinem vitest — die Zeile heisst "(MB)", gespeichert werden Bytes.
      const mbGelesen = tab.getControlValue("maxBytes");
      await tab.setControlValue("maxBytes", 3);
      const mbGespeichert = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.maxBytes;

      // Ungueltige Zahl: der native Pfad zeigt dafuer validate(), der Fallback-Walker
      // kennt validate NICHT — die Wache muss deshalb in setControlValue sitzen.
      await tab.setControlValue("keepDays", "keine Zahl");
      const ungueltigVerworfen =
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.keepDays > 0;

      return { da: true, defs: defs.length, uebernommen, nativeZeilen, fallbackZeilen,
               suchbegriff: ersterName, mbGelesen, mbGespeichert, ungueltigVerworfen,
               fallbackNamen, fallbackFilterSichtbar };
    `);

    if (!deklarativ.da) {
      record("Der Settings-Tab bietet getSettingDefinitions() an", false,
        "Methode fehlt — genau der Store-Befund prefer-setting-definitions");
    } else {
      record("getSettingDefinitions() liefert Zeilen und der Host hat sie uebernommen",
        (deklarativ.defs ?? 0) > 0 && deklarativ.uebernommen === deklarativ.defs,
        `${deklarativ.defs} Definitionen, ${deklarativ.uebernommen} vom Host uebernommen`);

      // DER Regress-Faenger: eine Zeile ohne Control ueberspringt der native Renderer
      // stillschweigend, waehrend der Fallback-Walker sie zeichnet. Unter 1.13 faellt das
      // nie auf, weil dort nur der Fallback laeuft.
      //
      // ⚠️ Dieser eine Punkt taugt NICHT als Vorher/Nachher-Beleg, und das ist keine
      // Schwaeche, sondern seine Bauart: vor der Migration existiert kein nativer Pfad,
      // also vergleicht er zweimal dasselbe display() und ist zwangslaeufig gruen
      // (gemessen 2026-08-23: alter Stand „nativ 7 · Fallback 7"). Er bewacht den NEUEN
      // Zustand gegen kuenftige Drift zwischen den beiden Pfaden — die vier Punkte um ihn
      // herum sind die, die am Vor-Stand tatsaechlich rot werden.
      record("Nativer Pfad und display()-Fallback zeichnen dieselbe Zeilenzahl",
        deklarativ.nativeZeilen === deklarativ.fallbackZeilen && (deklarativ.nativeZeilen ?? 0) > 0,
        `nativ ${deklarativ.nativeZeilen} · Fallback ${deklarativ.fallbackZeilen}`);

      record("Die MB-Anzeige uebersetzt in beide Richtungen (angezeigt MB, gespeichert Bytes)",
        deklarativ.mbGespeichert === 3 * 1024 * 1024 && typeof deklarativ.mbGelesen === "number",
        `gelesen ${deklarativ.mbGelesen} MB · nach setControlValue(3): ${deklarativ.mbGespeichert} Bytes`);

      record("Eine ungueltige Zahl wird auch ohne validate() verworfen (Fallback-Pfad)",
        deklarativ.ungueltigVerworfen === true,
        deklarativ.ungueltigVerworfen ? "keepDays bleibt positiv" : "keepDays wurde zu NaN/0 ueberschrieben");

      // Dieselben drei Ordner-Filter-Zeilen wie am nativen Pfad (oben, 13.), jetzt gegen den
      // display()-Fallback-Walker gelesen — beide Pfade muessen sie zeigen, nicht nur einer.
      const fbNamen = deklarativ.fallbackNamen ?? [];
      record("excludedFolders-Zeile steht am Fallback-Pfad",
        fbNamen.some((n) => /Never record notes from these folders|Notizen aus diesen Ordnern nie mitschreiben/.test(n)),
        `Zeilen: ${fbNamen.join(" | ")}`);
      record("strictFolderExclusion-Zeile steht am Fallback-Pfad",
        fbNamen.some((n) => /Strict folder exclusion|Strenger Ordner-Ausschluss/.test(n)),
        `Zeilen: ${fbNamen.join(" | ")}`);
      record("Die render-Hatch der Ordner-Filter-Grenzen steht sichtbar im Fallback-Pfad",
        deklarativ.fallbackFilterSichtbar === true,
        deklarativ.fallbackFilterSichtbar ? "Absatz sichtbar" : "Absatz fehlt oder ist unsichtbar");
    }

    // Auffindbarkeit in der Einstellungs-Suche — der eigentliche Nutzen der Migration,
    // gemessen im Dokument, in dem die Suche steht.
    if (deklarativ.da && deklarativ.suchbegriff) {
      const begriff = deklarativ.suchbegriff;
      // Zwei Fallen, beide am 2026-08-23 gegen 1.13.7 gemessen, beide sahen wie ein
      // Plugin-Defekt aus: (1) `feld.value = x` feuert NICHT — das Feld haengt an einem
      // eigenen Setter, man braucht den nativen Prototyp-Setter, sonst bleibt die Suche
      // leer und der Punkt meldet „nicht auffindbar". (2) Die Treffer stehen in
      // `.setting-search-result-group`/`.setting-search-result-tab`, nicht in einem
      // `.setting-item`-Container — ein geratener Selektor zaehlt hier immer 0.
      const suchen = (wert: string): string => `
        const feld = document.querySelector("input[type=search]");
        if (!feld) return -1;
        const setzen = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value").set;
        setzen.call(feld, ${JSON.stringify(wert)});
        feld.dispatchEvent(new Event("input", { bubbles: true }));
        return 0;
      `;
      const zaehlen = `
        return [...document.querySelectorAll(".setting-search-result-tab")]
          .filter(e => /LLM Lab/i.test(e.textContent || "")).length;
      `;
      const feldDa = await (tabCdp ?? cdp).evaluate<number>(suchen(begriff)).catch(() => -1);
      if (feldDa === -1) {
        record("Einstellungen sind ueber die Einstellungs-Suche auffindbar", false,
          "kein Suchfeld gefunden — Auffindbarkeit nicht belegt");
      } else {
        // Warten auf der Node-Seite, nicht im Renderer: `pollUntil` liefert erst, wenn der
        // Ausdruck etwas Wahrheitswertiges ergibt (0 Treffer = weiter warten).
        const gefunden = await pollUntil<number>(tabCdp ?? cdp, zaehlen, 5000, 250).catch(() => null);
        // Gegenprobe im selben Lauf: ein Begriff, den keine Definition traegt, MUSS 0
        // ergeben. Ohne sie belegt ein Treffer nur, dass irgendetwas gezaehlt wurde
        // (CORE-TEST-13) — die Suche zeigt bei leerer Eingabe alle Tabs an.
        await (tabCdp ?? cdp).evaluate(suchen("zzz-kein-treffer-erwartet")).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 900));
        const unsinn = await (tabCdp ?? cdp).evaluate<number>(zaehlen).catch(() => -1);
        record("Einstellungen sind ueber die Einstellungs-Suche auffindbar",
          (gefunden ?? 0) > 0 && unsinn === 0,
          `„${begriff}" → ${gefunden ?? 0} Treffer · Gegenprobe „zzz-…" → ${unsinn}`);
      }
    } else if (deklarativ.da) {
      // Kein ableitbarer Begriff heisst: keine benannte Definition. Das ist der Defekt,
      // den dieser Punkt fangen soll — als rot verbuchen, nicht ueberspringen.
      record("Einstellungen sind ueber die Einstellungs-Suche auffindbar", false,
        "kein Suchbegriff aus den Definitionen ableitbar (keine benannte Zeile)");
    }

    if (tabCdp !== cdp) tabCdp?.close();
    await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);

    // --- 14. log() wirft nie ------------------------------------------------
    // Die Zusage gehoert der Seite, die sie gibt: ein Konsument ruft mitten in seinem
    // Streaming-Pfad auf und darf dort nie reissen — auch nicht bei kaputtem Input.
    const robust = await cdp.evaluate<{ warf: boolean; typ: string }>(`
      const api = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].api;
      try { const r = api.log({ feature: "broken-input" }); return { warf: false, typ: typeof r }; }
      catch (e) { return { warf: true, typ: String(e && e.message) }; }
    `);
    record("log() wirft auch bei fehlerhaftem Input nicht",
      robust.warf === false && robust.typ === "string", robust.warf ? `warf: ${robust.typ}` : "id zurueckgegeben, nichts geschrieben");

    // --- 15. Kein Lab installiert -> passiert nichts -------------------------
    // Die Opt-in-Zusage ist technisch durchgesetzt, nicht versprochen: nach dem
    // Deaktivieren ist der Lookup weg, und der defensive Ausdruck eines Konsumenten
    // laeuft durch, statt zu werfen.
    const ohne = await cdp.evaluate<{ lookup: string; konsument: string }>(`
      await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
      await new Promise(r => setTimeout(r, 400));
      const lookup = typeof (app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] || {}).api;
      let konsument = "ok";
      try { app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]?.api?.log({ feature: "x" }); }
      catch (e) { konsument = "warf: " + String(e && e.message); }
      await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
      await new Promise(r => setTimeout(r, 600));
      return { lookup, konsument };
    `);
    record("Ohne aktives Lab findet ein Konsument nichts und bricht nicht",
      ohne.lookup === "undefined" && ohne.konsument === "ok",
      `Lookup ${ohne.lookup} · defensiver Aufruf ${ohne.konsument}`);

  } finally {
    if (savedSettings && !keep) {
      const zurueck = await cdp.evaluate<{ datei: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (p) { p.settings = ${JSON.stringify(savedSettings)}; await p.saveSettings(); }
        // Am ERGEBNIS messen, nicht am Objekt im Speicher: ein Aufraeumer, der sichtbar
        // aufraeumt und die Datei nicht anfasst, ist der teuerste Fehlerfall.
        return { datei: await app.vault.adapter.read(${JSON.stringify(".obsidian/plugins/" + PLUGIN_ID + "/data.json")}).catch(() => "") };
      `).catch(() => ({ datei: "" }));
      let gleich = false;
      try { gleich = JSON.stringify(JSON.parse(zurueck.datei) as unknown) === JSON.stringify(savedSettings); } catch { gleich = false; }
      console.log(`\n  Einstellungen zurueckgeschrieben — data.json ${gleich ? "stimmt mit dem Vorwert ueberein" : "ABWEICHUNG, Vorwert steht oben im Protokoll"}`);
    }
    if (!keep) {
      const weg = await cdp.evaluate<number>(`
        let n = 0;
        for (const pfad of ${JSON.stringify(angelegteDateien)}) {
          if (await app.vault.adapter.exists(pfad)) { await app.vault.adapter.remove(pfad); n++; }
        }
        return n;
      `).catch(() => 0);
      if (weg) console.log(`  ${weg} erfundene Trace-Datei(en) entfernt.`);
      console.log("  Die vom Lauf geschriebenen Zeilen der heutigen Trace-Datei bleiben stehen (Beleg des Laufs; --setup baut den Vault neu).");
    }
    await releaseAlwaysOnTop(cdp).catch(() => undefined);
    cdp.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} Pruefpunkte gruen`);
  if (failed.length) {
    console.log("\nOffen:");
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

/** Liest die Setting-Zeilen des geoeffneten Tabs. Als Funktion, weil derselbe Ausdruck
 *  gegen zwei Dokumente laufen muss (Modal im Workspace-Fenster ODER eigenes
 *  Einstellungs-Fenster ab Obsidian 1.13). */
function TAB_LESEN(base: string): string {
  return `
    const wurzel = document.querySelector(".vertical-tab-content.is-active") || document.querySelector(".vertical-tab-content");
    if (!wurzel || wurzel.getClientRects().length === 0) return { da: false };
    const zeilen = [...wurzel.querySelectorAll(".setting-item")];
    const namen = zeilen.map(z => (z.querySelector(".setting-item-name")?.textContent || "").trim()).filter(Boolean);
    const ort = zeilen.map(z => ({
      name: (z.querySelector(".setting-item-name")?.textContent || "").trim(),
      desc: (z.querySelector(".setting-item-description")?.textContent || "").trim(),
    })).find(z => z.desc.includes(${JSON.stringify(base)}));
    // Der Grenzen-Hinweis war bis 2026-08-23 ein blosses <p> am Ende; seit der Migration
    // auf getSettingDefinitions() ist er eine regulaere Setting-Zeile mit Beschreibung
    // (eine Zeile ohne Regler braucht im deklarativen Modell trotzdem einen Renderer).
    // Sichtbarkeit ueber getClientRects messen, nicht ueber Anwesenheit: ein Element kann
    // im DOM haengen und trotzdem nichts anzeigen.
    const grenzen = [...wurzel.querySelectorAll(".setting-item-description")]
      .find(p => /Masking finds patterns|Die Maskierung findet Muster/.test(p.textContent || ""));
    // Dritte inhaltlich verbindliche Zeile (Ordner-Filter-Grenzen), gleiche Bauart wie
    // 'grenzen' oben: eine render-Hatch ohne eigenen Regler, die der native Renderer
    // stillschweigend uebersaehe, waere sie keine eigene Definition mit Ueberschrift.
    const filterGrenzen = [...wurzel.querySelectorAll(".setting-item-description")]
      .find(p => /folder filter can and cannot see|Ordner-Filter sieht und was nicht|filter only applies to calls|Filter greift nur bei Aufrufen/i.test(p.textContent || ""));
    return {
      da: true,
      namen,
      ortText: ort ? (ort.name + " — " + ort.desc) : null,
      grenzenSichtbar: grenzen ? grenzen.getClientRects().length > 0 : false,
      filterGrenzenSichtbar: filterGrenzen ? filterGrenzen.getClientRects().length > 0 : false,
    };
  `;
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
