import { describe, it, expect } from "vitest";
import { buildDatasetEntry, parseJsonl, type DatasetEntry } from "../../src/core/dataset";
import { createPiiRedactor } from "../../src/core/redact_pii";
import type { TraceRecord } from "../../src/core/types";

const trace: TraceRecord = {
  id: "t1", ts: "2026-09-03T10:00:00.000Z", plugin: "koda-agent", feature: "chat",
  model: "m", endpointHost: "localhost:1234",
  messages: [{ role: "user", content: "Mail an anna@example.com" }],
  response: { content: "erledigt" }, latencyMs: 42,
};

describe("buildDatasetEntry", () => {
  it("kopiert den Trace und uebernimmt das Urteil", () => {
    const e = buildDatasetEntry(trace, { verdict: "up", tags: ["kurz"] },
      createPiiRedactor([]), "2026-09-03T11:00:00.000Z");
    expect(e.trace.id).toBe("t1");
    expect(e.verdict).toBe("up");
    expect(e.tags).toEqual(["kurz"]);
    expect(e.ratedAt).toBe("2026-09-03T11:00:00.000Z");
  });

  it("redigiert Trace UND Korrekturtext mit demselben Platzhalter", () => {
    const e = buildDatasetEntry(trace,
      { verdict: "down", tags: [], correction: "an anna@example.com antworten" },
      createPiiRedactor([]), "2026-09-03T11:00:00.000Z");
    expect(e.trace.messages[0].content).toContain("[EMAIL_1]");
    expect(e.correction).toContain("[EMAIL_1]");
    expect(e.correction).not.toContain("anna@example.com");
  });

  it("laesst leere Zusatzfelder weg statt sie als leeren String zu fuehren", () => {
    const e = buildDatasetEntry(trace, { verdict: "up", tags: [] },
      createPiiRedactor([]), "2026-09-03T11:00:00.000Z");
    expect("correction" in e).toBe(false);
    expect("note" in e).toBe(false);
  });
});

describe("parseJsonl", () => {
  it("liest Zeilen und ueberspringt kaputte, ohne sie zu verschweigen", () => {
    const roh = '{"a":1}\nkaputt{\n{"a":2}\n\n';
    const { rows, kaputt } = parseJsonl<{ a: number }>(roh);
    expect(rows.map((r) => r.a)).toEqual([1, 2]);
    expect(kaputt).toBe(1);
  });

  it("kommt mit einer abgeschnittenen letzten Zeile klar", () => {
    const { rows, kaputt } = parseJsonl<{ a: number }>('{"a":1}\n{"a":2');
    expect(rows).toHaveLength(1);
    expect(kaputt).toBe(1);
  });

  it("liefert bei leerem Inhalt nichts und meldet keinen Schaden", () => {
    expect(parseJsonl("")).toEqual({ rows: [], kaputt: 0 });
  });
});
