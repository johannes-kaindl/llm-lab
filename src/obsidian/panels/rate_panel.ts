import { Notice, setIcon, type App } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { confirmAction } from "../../vendor/kit-obsidian/confirm";
import type { HubPanel } from "../../vendor/kit-obsidian/hub";
import type { TraceRecord } from "../../core/types";
import { applyFilter, TraceReader, type TraceFilter } from "../../core/trace_reader";
import { type RateInput } from "../../core/dataset";
import { RateDetailsModal } from "./rate_details_modal";

/** Schmaler Vertrag zum Plugin — das Panel kennt weder Plugin noch Ports (UI-STANDARD §4). */
export interface RatePanelHost {
  app: App;
  reader(): TraceReader;
  ratedIds(): Promise<Set<string>>;
  /** Speichert eine Bewertung. Der Host baut den Redaktor, weil er die Einstellungen kennt.
   *  Wirft bei einem Schreibfehler (der zugrundeliegende `dataset.add` faengt nichts ab) —
   *  das Panel faengt den Fehler und zeigt eine Notice, statt ihn als unhandled rejection
   *  verschwinden zu lassen (Befund I4). */
  rate(trace: TraceRecord, urteil: RateInput): Promise<void>;
  /** Entfernt den Record physisch aus der Trace-Datei. Liefert `true` nur bei tatsaechlichem
   *  Erfolg — der zugrundeliegende `TraceStore.removeRecord` faengt seinen eigenen Fehler
   *  bewusst ab (fail-safe) und wirft nie; ohne diesen Rueckkanal waere ein gescheitertes
   *  Loeschen fuer das Panel nicht von einem erfolgreichen zu unterscheiden (Befund I4). */
  remove(trace: TraceRecord): Promise<boolean>;
}

export class RatePanel implements HubPanel<"rate"> {
  readonly id = "rate" as const;
  readonly icon = "thumbs-up";
  /** Getter, nicht Feld: setLang() laeuft in onload, nach der Modul-Auswertung.
   *  Ein Klassenfeld friere die Sprache still auf den Default ein — der i18n-Waechter
   *  meldet es zu Recht. */
  get label(): string { return t("view.tab.rate"); }

  private root!: HTMLElement;
  private filter: TraceFilter = { nurUnbewertete: true };
  private rows: TraceRecord[] = [];
  private sichtbar: TraceRecord[] = [];
  private kaputt = 0;
  private ratedIds = new Set<string>();
  private auswahl = 0;

  constructor(private readonly host: RatePanelHost) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "llm-lab-rate", attr: { tabindex: "-1" } });
    this.root.addEventListener("keydown", (ev) => this.onKey(ev));
  }

  onShow(): void {
    this.root.focus();
    void this.reload();
  }

  destroy(): void {
    this.root.empty();
  }

  private async reload(): Promise<void> {
    const { rows, kaputt } = await this.host.reader().all();
    this.rows = rows;
    this.kaputt = kaputt;
    this.ratedIds = await this.host.ratedIds();
    this.render();
  }

  /** DOM = reine Funktion des Zustands (UI-STANDARD §4): der sichtbare Inhalt wird
   *  stets aus den gehaltenen Feldern abgeleitet, nie aus dem DOM zurueckgelesen. */
  private render(): void {
    this.sichtbar = applyFilter(this.rows, this.filter, this.ratedIds);
    if (this.auswahl >= this.sichtbar.length) this.auswahl = Math.max(0, this.sichtbar.length - 1);

    this.root.empty();
    this.renderFilter();

    if (this.sichtbar.length === 0) {
      this.root.createDiv({ cls: "llm-lab-empty", text: t("rate.empty") });
      return;
    }

    const liste = this.root.createDiv({ cls: "llm-lab-liste" });
    this.sichtbar.forEach((r, i) => this.renderZeile(liste, r, i));
    this.renderDetail(this.sichtbar[this.auswahl]);
    this.renderAktionen(this.sichtbar[this.auswahl]);
    this.renderFuss();
  }

  private renderFilter(): void {
    const bar = this.root.createDiv({ cls: "llm-lab-filter" });

    const schalter = (label: string, an: boolean, um: () => void): void => {
      const b = bar.createEl("button", { text: label });
      b.toggleClass("mod-cta", an);
      b.setAttr("aria-pressed", String(an));
      b.onclick = () => { um(); this.render(); };
    };

    schalter(t("rate.filter.unrated"), this.filter.nurUnbewertete === true, () => {
      this.filter = { ...this.filter, nurUnbewertete: !this.filter.nurUnbewertete, nurFehler: false };
    });
    schalter(t("rate.filter.errors"), this.filter.nurFehler === true, () => {
      this.filter = { ...this.filter, nurFehler: !this.filter.nurFehler, nurUnbewertete: false };
    });

    const werte = (feld: "plugin" | "model"): string[] =>
      [...new Set(this.rows.map((r) => r[feld]))].sort();

    const auswahlFeld = (feld: "plugin" | "model", alle: string): void => {
      const sel = bar.createEl("select");
      sel.createEl("option", { text: alle, value: "" });
      for (const w of werte(feld)) sel.createEl("option", { text: w, value: w });
      sel.value = this.filter[feld] ?? "";
      sel.onchange = () => {
        this.filter = { ...this.filter, [feld]: sel.value || undefined };
        this.render();
      };
    };

    auswahlFeld("plugin", t("rate.filter.allPlugins"));
    auswahlFeld("model", t("rate.filter.allModels"));
  }

  private renderZeile(liste: HTMLElement, r: TraceRecord, i: number): void {
    const z = liste.createDiv({ cls: "llm-lab-zeile" });
    z.toggleClass("is-active", i === this.auswahl);
    z.onclick = () => { this.auswahl = i; this.render(); };

    z.createSpan({ text: r.ts.slice(11, 16) });
    z.createSpan({ cls: "llm-lab-zeile-meta", text: `${r.plugin} · ${r.feature} · ${r.model}` });

    // Zustand nie ueber Farbe allein (WCAG 1.4.1): Icon UND Text.
    const status = z.createSpan({ cls: "llm-lab-urteil" });
    const bewertet = this.ratedIds.has(r.id);
    setIcon(status.createSpan(), bewertet ? "check" : "circle-dashed");
    status.createSpan({ text: t(bewertet ? "rate.rated" : "rate.unrated") });
  }

  private renderDetail(r: TraceRecord): void {
    const d = this.root.createDiv({ cls: "llm-lab-detail" });
    for (const m of r.messages) {
      const block = d.createDiv({ cls: "llm-lab-nachricht" });
      block.createDiv({ cls: "llm-lab-rolle", text: m.role });
      block.createDiv({ cls: "llm-lab-inhalt", text: m.content });
    }
    const antwort = d.createDiv({ cls: "llm-lab-nachricht" });
    antwort.createDiv({ cls: "llm-lab-rolle", text: "assistant" });
    antwort.createDiv({ cls: "llm-lab-inhalt", text: r.error ?? r.response.content });

    const meta = [`${r.latencyMs} ms`];
    if (r.ttftMs != null) meta.push(`TTFT ${r.ttftMs} ms`);
    if (r.finishReason) meta.push(r.finishReason);
    if (r.promptTemplateHash) meta.push(`#${r.promptTemplateHash}`);
    if (r.turnId) meta.push(`turn ${r.turnId}`);
    d.createDiv({ cls: "llm-lab-zeile-meta", text: meta.join(" · ") });
  }

  private renderFuss(): void {
    const f = this.root.createDiv({ cls: "llm-lab-fuss" });
    f.createDiv({ text: t("rate.count", this.sichtbar.length, this.rows.length) });
    if (this.kaputt > 0) f.createDiv({ text: t("rate.broken", this.kaputt) });
  }

  private renderAktionen(r: TraceRecord): void {
    const bar = this.root.createDiv({ cls: "llm-lab-aktionen" });

    // Aktionen gehoeren in den INHALT, nicht in den View-Kopf: in einer Seitenleiste
    // blendet Obsidian den Kopf per app.css aus, eine addAction()-Aktion waere dort
    // null Pixel hoch (UI-STANDARD §4).
    const knopf = (label: string, icon: string, aus: boolean, tun: () => void): void => {
      const b = bar.createEl("button");
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.disabled = aus;
      b.onclick = tun;
    };

    const fehler = r.error !== undefined;
    knopf(t("rate.up"), "thumbs-up", fehler, () => void this.bewerte(r, "up"));
    knopf(t("rate.down"), "thumbs-down", fehler, () => void this.bewerte(r, "down"));
    knopf(t("rate.details"), "pencil", fehler, () => this.vertiefe(r, "up"));
    knopf(t("rate.delete"), "trash-2", false, () => void this.loesche(r));

    if (fehler) bar.createDiv({ cls: "llm-lab-fuss", text: t("rate.errorNotRateable") });
  }

  private async bewerte(r: TraceRecord, verdict: "up" | "down"): Promise<void> {
    if (r.error !== undefined) return;
    const vorherigeSichtbar = this.sichtbar;
    const vorherigerIndex = vorherigeSichtbar.indexOf(r);
    try {
      await this.host.rate(r, { verdict, tags: [] });
    } catch (e) {
      console.warn("LLM Lab: Bewertung konnte nicht gespeichert werden", e);
      new Notice(t("rate.rateFailed"));
      return;
    }
    this.ratedIds.add(r.id);
    this.weiter(vorherigeSichtbar, vorherigerIndex);
  }

  /** Vertiefung: Urteil MIT Tags, Notiz und Korrektur. Ohne Urteil kein Dialog —
   *  die Vertiefung ergaenzt eine Bewertung, sie ersetzt sie nicht. */
  private vertiefe(r: TraceRecord, verdict: "up" | "down"): void {
    if (r.error !== undefined) return;
    const vorherigeSichtbar = this.sichtbar;
    const vorherigerIndex = vorherigeSichtbar.indexOf(r);
    new RateDetailsModal(this.host.app, verdict, (urteil) => {
      if (!urteil) return;
      void (async () => {
        try {
          await this.host.rate(r, urteil);
        } catch (e) {
          console.warn("LLM Lab: Bewertung konnte nicht gespeichert werden", e);
          new Notice(t("rate.rateFailed"));
          return;
        }
        this.ratedIds.add(r.id);
        this.weiter(vorherigeSichtbar, vorherigerIndex);
      })();
    }).open();
  }

  private async loesche(r: TraceRecord): Promise<void> {
    const ok = await confirmAction(this.host.app, {
      title: t("rate.deleteConfirm.title"),
      message: t("rate.deleteConfirm.body"),
      confirmLabel: t("rate.deleteConfirm.cta"),
      warning: true,   // Default ist ohnehin true; hier explizit, weil destruktiv
    });
    if (!ok) return;
    const entfernt = await this.host.remove(r);
    if (!entfernt) {
      new Notice(t("rate.deleteFailed"));
      return;
    }
    this.rows = this.rows.filter((x) => x.id !== r.id);
    this.render();
  }

  /** Nach einem Urteil zum naechsten Record — das ist der Durchratter-Rhythmus.
   *
   *  Nimmt die sichtbare Liste UND die Auswahl-Position von VOR der Bewertung entgegen
   *  (Befund I1): `this.sichtbar`/`this.auswahl` wuerden nach `render()` schon die neue,
   *  um den eben bewerteten Record verkuerzte Liste zeigen — eine blinde `+1` darauf
   *  ueberspringt bei aktivem "nur unbewertete"-Filter immer den naechsten Record. Der
   *  korrekte naechste Record ist der, der in der ALTEN Reihenfolge direkt auf den eben
   *  bewerteten folgte — dessen id wird in der NEUEN (gefilterten) Liste wiedergefunden. */
  private weiter(vorherigeSichtbar: TraceRecord[], vorherigerIndex: number): void {
    const naechsteId = vorherigeSichtbar[vorherigerIndex + 1]?.id;
    const neueSichtbar = applyFilter(this.rows, this.filter, this.ratedIds);
    const idx = naechsteId ? neueSichtbar.findIndex((x) => x.id === naechsteId) : -1;
    this.auswahl = idx >= 0 ? idx : Math.min(this.auswahl, Math.max(0, neueSichtbar.length - 1));
    this.render();
  }

  private onKey(ev: KeyboardEvent): void {
    const r = this.sichtbar[this.auswahl];
    if (!r) return;
    const tasten: Record<string, () => void> = {
      j: () => { this.auswahl = Math.min(this.auswahl + 1, this.sichtbar.length - 1); this.render(); },
      k: () => { this.auswahl = Math.max(this.auswahl - 1, 0); this.render(); },
      g: () => void this.bewerte(r, "up"),
      b: () => void this.bewerte(r, "down"),
      Delete: () => void this.loesche(r),
      Enter: () => this.vertiefe(r, "up"),
    };
    const tun = tasten[ev.key];
    if (!tun) return;
    ev.preventDefault();
    tun();
  }

  // ── oeffentlich fuer die Commands aus main.ts ────────────────────────────
  rateCurrent(verdict: "up" | "down"): void {
    const r = this.sichtbar[this.auswahl];
    if (r) void this.bewerte(r, verdict);
  }
  deleteCurrent(): void {
    const r = this.sichtbar[this.auswahl];
    if (r) void this.loesche(r);
  }
}
