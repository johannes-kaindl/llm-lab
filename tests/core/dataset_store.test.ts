import { describe, it, expect } from "vitest";
import { DatasetStore } from "../../src/core/dataset_store";
import type { TraceSink } from "../../src/core/trace_store";
import type { DatasetEntry } from "../../src/core/dataset";
import type { TraceRecord } from "../../src/core/types";

function fakeSink(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const sink: TraceSink = {
    append: async (p, d) => { files.set(p, (files.get(p) ?? "") + d); },
    list: async () => [],
    remove: async (p) => { files.delete(p); },
    read: async (p) => files.get(p) ?? "",
    write: async (p, d) => { files.set(p, d); },
  };
  return { sink, files };
}

const trace = (id: string): TraceRecord => ({
  id, ts: "2026-09-03T10:00:00.000Z", plugin: "p", feature: "chat",
  model: "m", endpointHost: "h", messages: [{ role: "user", content: "x" }],
  response: { content: "y" }, latencyMs: 1,
});

const eintrag = (id: string, verdict: "up" | "down", ratedAt: string): DatasetEntry =>
  ({ trace: trace(id), verdict, tags: [], ratedAt });

describe("DatasetStore", () => {
  it("haengt an und liest zurueck", async () => {
    const { sink } = fakeSink();
    const s = new DatasetStore(sink, "lab");
    await s.add(eintrag("t1", "up", "2026-09-03T11:00:00.000Z"));
    expect((await s.list()).map((e) => e.trace.id)).toEqual(["t1"]);
  });

  it("behaelt bei doppelter trace.id den JUENGSTEN Eintrag", async () => {
    const { sink } = fakeSink();
    const s = new DatasetStore(sink, "lab");
    await s.add(eintrag("t1", "up", "2026-09-03T11:00:00.000Z"));
    await s.add(eintrag("t1", "down", "2026-09-03T12:00:00.000Z"));
    const alle = await s.list();
    expect(alle).toHaveLength(1);
    expect(alle[0].verdict).toBe("down");
  });

  it("entscheidet nach ratedAt, nicht nach Dateireihenfolge", async () => {
    const { sink } = fakeSink();
    const s = new DatasetStore(sink, "lab");
    await s.add(eintrag("t1", "down", "2026-09-03T12:00:00.000Z"));
    await s.add(eintrag("t1", "up", "2026-09-03T11:00:00.000Z")); // aelter, spaeter geschrieben
    expect((await s.list())[0].verdict).toBe("down");
  });

  it("liefert die Menge der bewerteten Trace-ids", async () => {
    const { sink } = fakeSink();
    const s = new DatasetStore(sink, "lab");
    await s.add(eintrag("t1", "up", "2026-09-03T11:00:00.000Z"));
    await s.add(eintrag("t2", "up", "2026-09-03T11:00:00.000Z"));
    const ids = await s.ratedIds();
    expect(ids.has("t1")).toBe(true);
    expect(ids.has("t9")).toBe(false);
  });

  it("liefert bei fehlender Datei eine leere Liste", async () => {
    const { sink } = fakeSink();
    expect(await new DatasetStore(sink, "lab").list()).toEqual([]);
  });
});
