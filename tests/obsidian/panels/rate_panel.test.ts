import { describe, it, expect, vi, beforeEach } from "vitest";
import { RatePanel, type RatePanelHost } from "../../../src/obsidian/panels/rate_panel";
import type { TraceRecord } from "../../../src/core/types";
import type { TraceReader } from "../../../src/core/trace_reader";
import { t } from "../../../src/vendor/kit/i18n";
// Side-Effect-Import: registriert die echten EN/DE-Strings bei t() — ohne ihn liefert t()
// nur den rohen Key zurueck, weil main.ts (der normale Registrierungsort) hier nie laeuft.
import "../../../src/core/i18n/strings";
import { makeFakeEl, noticeLog, resetNoticeLog } from "../../__mocks__/obsidian";

// confirmAction gehoert zur Bestaetigungs-UI, nicht zum Befund I4 (der prueft den
// Rueckkanal von RatePanelHost.remove) — hier fest auf "bestaetigt" gemockt, damit
// loesche() bis zu host.remove() durchlaeuft, ohne die Modal-Button-Mechanik nachzubauen.
vi.mock("../../../src/vendor/kit-obsidian/confirm", () => ({
  confirmAction: vi.fn(async () => true),
}));

const rec = (over: Partial<TraceRecord>): TraceRecord => ({
  id: "t1",
  ts: "2026-09-03T10:00:00.000Z",
  plugin: "p",
  feature: "chat",
  model: "m1",
  endpointHost: "h",
  messages: [{ role: "user", content: "x" }],
  response: { content: "y" },
  latencyMs: 1,
  ...over,
});

/** Wartet, bis alle ausstehenden Microtasks (await-Ketten in bewerte()/loesche()) durch
 *  sind — beide Panel-Methoden werden ueber die oeffentlichen `rateCurrent`/`deleteCurrent`
 *  fire-and-forget aufgerufen (`void this....`), ein Test muss ihnen deshalb Zeit geben. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function buildHost(overrides: Partial<RatePanelHost> = {}): RatePanelHost {
  return {
    app: {} as never,
    reader: () => ({ all: async () => ({ rows: [], kaputt: 0 }) }) as unknown as TraceReader,
    ratedIds: async () => new Set(),
    rate: async () => {},
    remove: async () => true,
    ...overrides,
  };
}

describe("RatePanel — Durchratter-Rhythmus (Befund I1)", () => {
  it("bewertet vier Records bei aktivem \"nur unbewertete\"-Filter in der urspruenglichen Reihenfolge", async () => {
    // Neueste zuerst, wie applyFilter sortiert — Simulation aus dem Review-Text.
    const rows = [
      rec({ id: "A", ts: "2026-09-04T10:00:00.000Z" }),
      rec({ id: "B", ts: "2026-09-03T10:00:00.000Z" }),
      rec({ id: "C", ts: "2026-09-02T10:00:00.000Z" }),
      rec({ id: "D", ts: "2026-09-01T10:00:00.000Z" }),
    ];
    const rated: string[] = [];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
      rate: async (trace) => { rated.push(trace.id); },
    });

    const panel = new RatePanel(host);
    panel.mount(makeFakeEl());
    await (panel as unknown as { reload(): Promise<void> }).reload();

    for (let i = 0; i < 4; i++) {
      panel.rateCurrent("up");
      await flush();
    }

    expect(rated).toEqual(["A", "B", "C", "D"]);
  });
});

describe("RatePanel — Fokus (Befund M2)", () => {
  it("fokussiert den Container nach jedem Neuzeichnen, nicht nur beim ersten Mount", async () => {
    const rows = [rec({ id: "A" })];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
    });

    const container = makeFakeEl();
    const panel = new RatePanel(host);
    panel.mount(container);
    const root = container.children[0];
    const fokus = vi.fn();
    root.focus = fokus;

    await (panel as unknown as { reload(): Promise<void> }).reload();
    expect(fokus).toHaveBeenCalled();

    fokus.mockClear();
    panel.rateCurrent("up");
    await flush();
    // rateCurrent -> bewerte() -> weiter() -> render() -> root.empty() + root.focus():
    // ohne den Fix waere der Fokus nach diesem Neuzeichnen auf <body> gelandet.
    expect(fokus).toHaveBeenCalled();
  });
});

describe("RatePanel — Filter-Controls behalten ihre Tasten (Befund M3)", () => {
  it("ignoriert Tastendruecke, deren Ziel ein Filter-Control ist", async () => {
    const rows = [rec({ id: "A" }), rec({ id: "B", ts: "2026-09-02T10:00:00.000Z" })];
    const geloescht: string[] = [];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
      remove: async (t) => { geloescht.push(t.id); return true; },
    });

    const panel = new RatePanel(host);
    panel.mount(makeFakeEl());
    await (panel as unknown as { reload(): Promise<void> }).reload();

    const onKey = (panel as unknown as { onKey(ev: unknown): void }).onKey.bind(panel);
    for (const tag of ["INPUT", "SELECT", "BUTTON", "TEXTAREA"]) {
      onKey({ key: "Delete", target: { tagName: tag }, preventDefault: vi.fn() });
    }
    await flush();
    expect(geloescht).toEqual([]);

    // Gegenprobe: dieselbe Taste OHNE Filter-Ziel wirkt weiterhin.
    onKey({ key: "Delete", target: { tagName: "DIV" }, preventDefault: vi.fn() });
    await flush();
    expect(geloescht).toEqual(["A"]);
  });
});

describe("RatePanel — zwei Instanzen teilen kein DOM (Befund I2)", () => {
  it("laesst eine Instanz unberuehrt, wenn eine andere destroy() aufruft", async () => {
    const rows = [rec({ id: "A" })];
    const hostA = buildHost({ reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader });
    const hostB = buildHost({ reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader });

    // Zwei durch eine Factory gebaute Instanzen — genau das Muster aus main.ts nach dem
    // Fix (eine Instanz je Leaf statt einer geteilten). Vorher haette EINE Instanz beide
    // Container gemountet bekommen, und destroy() der zweiten Leaf haette die erste geleert.
    const containerA = makeFakeEl();
    const containerB = makeFakeEl();
    const panelA = new RatePanel(hostA);
    const panelB = new RatePanel(hostB);
    panelA.mount(containerA);
    panelB.mount(containerB);
    await (panelA as unknown as { reload(): Promise<void> }).reload();
    await (panelB as unknown as { reload(): Promise<void> }).reload();

    panelB.destroy();

    expect(containerA.children[0].children.length).toBeGreaterThan(0);
  });
});

describe("RatePanel — Fehlerrueckmeldung (Befund I4)", () => {
  beforeEach(() => {
    resetNoticeLog();
  });

  it("zeigt eine Notice und aendert weder rows noch ratedIds, wenn das Speichern einer Bewertung scheitert", async () => {
    const rows = [rec({ id: "A" })];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
      rate: async () => { throw new Error("Platte voll"); },
    });

    const panel = new RatePanel(host);
    panel.mount(makeFakeEl());
    await (panel as unknown as { reload(): Promise<void> }).reload();

    panel.rateCurrent("up");
    await flush();

    expect(noticeLog).toEqual([t("rate.rateFailed")]);
    expect((panel as unknown as { ratedIds: Set<string> }).ratedIds.has("A")).toBe(false);
    expect((panel as unknown as { rows: TraceRecord[] }).rows.map((r) => r.id)).toEqual(["A"]);
  });

  it("zeigt eine Notice und behaelt die Zeile, wenn das Loeschen scheitert (host.remove liefert false)", async () => {
    const rows = [rec({ id: "A" })];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
      remove: async () => false,
    });

    const panel = new RatePanel(host);
    panel.mount(makeFakeEl());
    await (panel as unknown as { reload(): Promise<void> }).reload();

    panel.deleteCurrent();
    await flush();

    expect(noticeLog).toEqual([t("rate.deleteFailed")]);
    expect((panel as unknown as { rows: TraceRecord[] }).rows.map((r) => r.id)).toEqual(["A"]);
  });

  it("entfernt die Zeile bei erfolgreichem Loeschen, ohne Notice", async () => {
    const rows = [rec({ id: "A" })];
    const host = buildHost({
      reader: () => ({ all: async () => ({ rows, kaputt: 0 }) }) as unknown as TraceReader,
      remove: async () => true,
    });

    const panel = new RatePanel(host);
    panel.mount(makeFakeEl());
    await (panel as unknown as { reload(): Promise<void> }).reload();

    panel.deleteCurrent();
    await flush();

    expect(noticeLog).toEqual([]);
    expect((panel as unknown as { rows: TraceRecord[] }).rows).toEqual([]);
  });
});
