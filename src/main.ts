import { Plugin, WorkspaceLeaf, getLanguage, setIcon } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import "./core/i18n/strings";
import { DEFAULT_SETTINGS, type LabSettings } from "./core/settings";
import { TraceStore } from "./core/trace_store";
import { createLlmLabApi, type LlmLabApi } from "./plugin_api";
import { vaultSink } from "./obsidian/vault_sink";
import { LabSettingTab } from "./obsidian/settings_tab";
import { LabView, VIEW_TYPE_LAB } from "./obsidian/lab_view";
import { RatePanel, type RatePanelHost } from "./obsidian/panels/rate_panel";
import { DatasetStore } from "./core/dataset_store";
import { TraceReader } from "./core/trace_reader";
import { buildDatasetEntry, type RateInput } from "./core/dataset";
import { createPiiRedactor } from "./core/redact_pii";
import type { TraceRecord } from "./core/types";

export default class LlmLabPlugin extends Plugin {
  settings: LabSettings = DEFAULT_SETTINGS;
  api!: LlmLabApi;
  /** Sitzungszustand, bewusst nicht persistiert: eine Pause soll beim naechsten Start
   *  von selbst enden, damit niemand wochenlang stumm mitlaeuft, ohne es zu merken. */
  private paused = false;
  private statusEl?: HTMLElement;
  private store!: TraceStore;
  private dataset!: DatasetStore;
  private reader!: TraceReader;

  async onload(): Promise<void> {
    setLang(pickLang(getLanguage()));
    const loaded = (await this.loadData()) as Partial<LabSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    const base = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    const sink = vaultSink(this.app.vault.adapter);
    this.store = new TraceStore(
      sink,
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

    this.dataset = new DatasetStore(sink, base);
    this.reader = new TraceReader(sink, base);

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

    // Factory statt geteilter Instanz (Befund I2): registerView() wird von Obsidian fuer
    // JEDE Leaf des Typs neu aufgerufen (Layout-Wiederherstellung, Split, "in neues Fenster
    // verschieben" erzeugen mehrere Leaves desselben View-Typs). Eine einzelne, in onload()
    // gebaute RatePanel-Instanz haette ihren Container (`private root!`) beim zweiten
    // mount() ueberschrieben — das erste Fenster bliebe mit totem DOM stehen, und ein
    // onClose() dort haette ueber die geteilte Instanz auch das zweite geleert.
    this.registerView(
      VIEW_TYPE_LAB,
      (leaf: WorkspaceLeaf) => new LabView(leaf, [new RatePanel(this.ratePanelHost())]),
    );

    this.addRibbonIcon("flask-conical", t("command.openView"), () => void this.openView());

    this.addCommand({ id: "open-view", name: t("command.openView"), callback: () => void this.openView() });
    this.addCommand({ id: "rate-up", name: t("command.rateUp"), callback: () => this.activeRatePanel()?.rateCurrent("up") });
    this.addCommand({ id: "rate-down", name: t("command.rateDown"), callback: () => this.activeRatePanel()?.rateCurrent("down") });
    this.addCommand({ id: "delete-record", name: t("command.deleteRecord"), callback: () => this.activeRatePanel()?.deleteCurrent() });
  }

  /** Host-Vertrag fuer eine frisch gebaute RatePanel-Instanz — Store/Dataset/Reader sind
   *  geteilte, zustandslose Ports (das ist unproblematisch), nur der DOM-Container einer
   *  RatePanel-Instanz darf nie geteilt werden (Befund I2). */
  private ratePanelHost(): RatePanelHost {
    return {
      app: this.app,
      reader: () => this.reader,
      ratedIds: () => this.dataset.ratedIds(),
      rate: async (trace: TraceRecord, urteil: RateInput) => {
        // EIN Redaktor fuer Record, Notiz und Korrektur — geteilter Platzhalter-Zaehler.
        const redaktor = createPiiRedactor(this.settings.customPiiTerms);
        await this.dataset.add(
          buildDatasetEntry(trace, urteil, redaktor, new Date().toISOString()),
        );
      },
      remove: (trace: TraceRecord) =>
        this.store.removeRecord(TraceReader.dayOf(trace), trace.id),
    };
  }

  /** Commands sind global (Befehlspalette/Hotkeys), gehoeren aber der Leaf, die gerade
   *  aktiv ist — nicht mehr einer einzigen App-weiten Instanz. */
  private activeRatePanel(): RatePanel | undefined {
    const view = this.app.workspace.getActiveViewOfType(LabView);
    return view?.getPanel("rate") as RatePanel | undefined;
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

  /** Im HAUPTBEREICH, nicht in der Seitenleiste: bewerten heisst System-Prompt und
   *  Antwort vergleichen, und eine 300px-Sidebar macht daraus eine Lese-Roehre.
   *  (Design 2026-09-02 §2, von Johannes am 2026-09-03 bestaetigt.) */
  private async openView(): Promise<void> {
    const vorhanden = this.app.workspace.getLeavesOfType(VIEW_TYPE_LAB);
    if (vorhanden.length > 0) {
      await this.app.workspace.revealLeaf(vorhanden[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_LAB, active: true });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
