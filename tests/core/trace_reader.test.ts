import { describe, it, expect } from "vitest";
import { applyFilter, TraceReader, LISTEN_GRENZE } from "../../src/core/trace_reader";
import type { TraceSink } from "../../src/core/trace_store";
import type { TraceRecord } from "../../src/core/types";

const rec = (over: Partial<TraceRecord>): TraceRecord => ({
  id: "t1", ts: "2026-09-03T10:00:00.000Z", plugin: "koda-agent", feature: "chat",
  model: "m1", endpointHost: "h", messages: [{ role: "user", content: "x" }],
  response: { content: "y" }, latencyMs: 1, ...over,
});

describe("applyFilter", () => {
  const alle = [
    rec({ id: "a" }),
    rec({ id: "b", plugin: "transmute" }),
    rec({ id: "c", error: "kaputt" }),
    rec({ id: "d", model: "m2" }),
  ];

  it("zeigt standardmaessig nur unbewertete OHNE Fehler-Records", () => {
    const out = applyFilter(alle, { nurUnbewertete: true }, new Set(["a"]));
    expect(out.map((r) => r.id)).toEqual(["d", "b"]);
  });

  it("zeigt Fehler-Records nur im eigenen Filter", () => {
    const out = applyFilter(alle, { nurFehler: true }, new Set());
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });

  it("filtert nach Plugin, Feature und Modell", () => {
    expect(applyFilter(alle, { plugin: "transmute" }, new Set()).map((r) => r.id)).toEqual(["b"]);
    expect(applyFilter(alle, { model: "m2" }, new Set()).map((r) => r.id)).toEqual(["d"]);
  });

  it("sortiert neueste zuerst", () => {
    const out = applyFilter(
      [rec({ id: "alt", ts: "2026-09-01T10:00:00.000Z" }), rec({ id: "neu", ts: "2026-09-03T10:00:00.000Z" })],
      {}, new Set());
    expect(out.map((r) => r.id)).toEqual(["neu", "alt"]);
  });

  it("begrenzt auf LISTEN_GRENZE", () => {
    const viele = Array.from({ length: LISTEN_GRENZE + 50 }, (_, i) => rec({ id: `r${i}` }));
    expect(applyFilter(viele, {}, new Set())).toHaveLength(LISTEN_GRENZE);
  });
});

describe("TraceReader", () => {
  it("sammelt alle Tagesdateien ein und zaehlt kaputte Zeilen", async () => {
    const files = new Map<string, string>([
      ["lab/traces/2026-09-02.jsonl", JSON.stringify(rec({ id: "x" })) + "\n"],
      ["lab/traces/2026-09-03.jsonl", JSON.stringify(rec({ id: "y" })) + "\nkaputt{\n"],
    ]);
    const sink: TraceSink = {
      append: async () => {}, remove: async () => {}, write: async () => {},
      list: async () => [...files.keys()].map((p) => ({ name: p.split("/").pop()!, bytes: 1 })),
      read: async (p) => files.get(p) ?? "",
    };
    const { rows, kaputt } = await new TraceReader(sink, "lab").all();
    expect(rows.map((r) => r.id).sort()).toEqual(["x", "y"]);
    expect(kaputt).toBe(1);
  });
});
