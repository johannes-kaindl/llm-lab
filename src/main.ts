import { Plugin, getLanguage, setIcon } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import "./core/i18n/strings";
import { DEFAULT_SETTINGS, type LabSettings } from "./core/settings";
import { TraceStore } from "./core/trace_store";
import { createLlmLabApi, type LlmLabApi } from "./plugin_api";
import { vaultSink } from "./obsidian/vault_sink";
import { LabSettingTab } from "./obsidian/settings_tab";

export default class LlmLabPlugin extends Plugin {
  settings: LabSettings = DEFAULT_SETTINGS;
  api!: LlmLabApi;
  /** Sitzungszustand, bewusst nicht persistiert: eine Pause soll beim naechsten Start
   *  von selbst enden, damit niemand wochenlang stumm mitlaeuft, ohne es zu merken. */
  private paused = false;
  private statusEl?: HTMLElement;
  private store!: TraceStore;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    const loaded = (await this.loadData()) as Partial<LabSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    const base = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    this.store = new TraceStore(
      vaultSink(this.app.vault.adapter),
      base,
      // Getter statt Snapshot: eine Aenderung an keepDays/maxBytes in den Einstellungen
      // greift damit sofort beim naechsten Rotationslauf statt erst nach einem Neustart.
      () => ({ keepDays: this.settings.keepDays, maxBytes: this.settings.maxBytes }),
      () => new Date().toISOString().slice(0, 10),
    );
    // Ein Rotationslauf beim Start, unabhaengig von jedem Schreibvorgang — sonst raeumt
    // ein pausiertes/deaktiviertes Plugin (oder eines, das schlicht eine Weile nicht
    // benutzt wird) nie etwas weg, egal wie kurz "Traces aufbewahren (Tage)" gesetzt ist.
    await this.store.rotate();

    this.api = createLlmLabApi({
      store: () => this.store,
      settings: () => this.settings,
      paused: () => this.paused,
      // Slice 1: keine eigenen Endpunkt-Schluessel. Die Bearer-Regel in redactSecrets
      // greift trotzdem und faengt durchgereichte Header-Echos.
      secrets: () => [],
      now: () => new Date().toISOString(),
      newId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    });

    this.statusEl = this.addStatusBarItem();
    this.renderStatus();

    this.addCommand({
      id: "toggle-pause",
      name: t("command.togglePause"),
      callback: () => {
        this.paused = !this.paused;
        this.renderStatus();
      },
    });

    this.addSettingTab(new LabSettingTab(this.app, this));
  }

  /** Zustand nie nur ueber Farbe: Icon UND Text (WCAG 1.4.1). */
  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();
    const icon = this.statusEl.createSpan();
    setIcon(icon, this.paused ? "pause-circle" : "circle-dot");
    this.statusEl.createSpan({
      text: " " + t(this.paused ? "status.paused" : "status.recording"),
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
