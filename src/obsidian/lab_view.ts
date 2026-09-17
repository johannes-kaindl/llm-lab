import { ItemView, type WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { buildHubInto, type HubController, type HubPanel } from "../vendor/kit-obsidian/hub";

export const VIEW_TYPE_LAB = "llm-lab-view";

export type LabTabId = "rate" | "stats" | "export";

export class LabView extends ItemView {
  private ctrl: HubController<LabTabId> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly panels: HubPanel<LabTabId>[],
    private navState: LabTabId = "rate",
  ) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_LAB; }
  getDisplayText(): string { return t("view.title"); }
  getIcon(): string { return "flask-conical"; }

  /** Fuer die Commands aus main.ts, die auf dem Panel der AKTIVEN Leaf arbeiten sollen
   *  (Befund I2: `panels` gehoert dieser Leaf allein, keine geteilte Instanz mehr). */
  getPanel<Id extends LabTabId>(id: Id): HubPanel<LabTabId> | undefined {
    return this.panels.find((p) => p.id === id);
  }

  async onOpen(): Promise<void> {
    this.ctrl = buildHubInto(this.contentEl, this.panels, this.navState);
  }

  async onClose(): Promise<void> {
    this.ctrl?.destroy();
    this.ctrl = null;
    this.contentEl.empty();
  }

  /** Der aktive Tab ueberlebt einen Neustart ueber die Layout-Persistenz. Befund M4:
   *  `super.getState()` mitfuehren statt zu verwerfen — was die Basisklasse selbst
   *  persistieren will (heute nichts Bekanntes, potenziell kuenftige Obsidian-Felder). */
  getState(): Record<string, unknown> {
    return { ...super.getState(), tab: this.ctrl?.currentTab() ?? this.navState };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const tab = (state as { tab?: LabTabId } | null)?.tab;
    if (tab) { this.navState = tab; this.ctrl?.setTab(tab); }
    return super.setState(state, result);
  }
}
