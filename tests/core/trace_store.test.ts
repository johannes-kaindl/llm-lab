import { describe, it, expect } from "vitest";
import { TraceStore, type TraceSink } from "../../src/core/trace_store";
import type { TraceRecord } from "../../src/core/types";

function fakeSink(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const written: Array<{ path: string; data: string }> = [];
  const removed: string[] = [];
  const sink: TraceSink = {
    append: async (path, data) => {
      files.set(path, (files.get(path) ?? "") + data);
      written.push({ path, data });
    },
    list: async () => [],
    remove: async (path) => {
      files.delete(path);
      removed.push(path);
    },
    read: async (path) => files.get(path) ?? "",
    write: async (path, data) => {
      files.set(path, data);
    },
  };
  return { sink, written, removed, files };
}

const rec: TraceRecord = {
  id: "t1",
  ts: "2026-08-22T10:00:00.000Z",
  plugin: "p",
  feature: "chat",
  model: "m",
  endpointHost: "localhost:1234",
  messages: [{ role: "user", content: "hallo Bearer abcdefgh1234" }],
  response: { content: "hi" },
  latencyMs: 10,
};

const limits = () => ({ keepDays: 7, maxBytes: 1000 });

describe("TraceStore", () => {
  it("schreibt eine JSON-Zeile in die Datei des Tages", async () => {
    const { sink, written } = fakeSink();
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(rec);
    expect(written[0].path).toBe("lab/traces/2026-08-22.jsonl");
    expect(written[0].data.endsWith("\n")).toBe(true);
    expect(JSON.parse(written[0].data).id).toBe("t1");
  });

  it("redigiert Schluessel VOR dem Schreiben — auch im rohen Trace", async () => {
    const { sink, written } = fakeSink();
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(rec, {
      secrets: ["abcdefgh1234"],
    });
    expect(written[0].data).not.toContain("abcdefgh1234");
  });

  it("reisst einen Aufruf nie mit, wenn das Schreiben scheitert", async () => {
    const sink: TraceSink = {
      append: async () => {
        throw new Error("Platte voll");
      },
      list: async () => [],
      remove: async () => {},
      read: async () => "",
      write: async () => {},
    };
    const store = new TraceStore(sink, "lab", limits, () => "2026-08-22");
    await expect(store.writeNow(rec)).resolves.toBeUndefined();
  });

  it("raeumt beim Schreiben ueberfaellige Dateien weg", async () => {
    const removed: string[] = [];
    const sink: TraceSink = {
      append: async () => {},
      list: async () => [{ name: "2026-08-01.jsonl", bytes: 10 }],
      remove: async (p) => {
        removed.push(p);
      },
      read: async () => "",
      write: async () => {},
    };
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(rec);
    expect(removed).toEqual(["lab/traces/2026-08-01.jsonl"]);
  });

  it("write() gibt sofort zurueck und wartet nie auf die Platte", () => {
    const { sink } = fakeSink();
    const store = new TraceStore(sink, "lab", limits, () => "2026-08-22");
    expect(store.write(rec)).toBeUndefined();
  });

  it("redactPii:true redigiert eine E-Mail in messages[0].content", async () => {
    const { sink, written } = fakeSink();
    const withEmail: TraceRecord = {
      ...rec,
      messages: [{ role: "user", content: "Kontakt: jane.doe@example.com bitte antworten" }],
    };
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(withEmail, {
      redactPii: true,
    });
    const written0 = JSON.parse(written[0].data) as TraceRecord;
    expect(written0.messages[0].content).toContain("[EMAIL_1]");
    expect(written0.messages[0].content).not.toContain("jane.doe@example.com");
  });

  it("ohne redactPii bleibt dieselbe E-Mail unveraendert — Rohtrace bleibt roh per Default", async () => {
    const { sink, written } = fakeSink();
    const withEmail: TraceRecord = {
      ...rec,
      messages: [{ role: "user", content: "Kontakt: jane.doe@example.com bitte antworten" }],
    };
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(withEmail);
    const written0 = JSON.parse(written[0].data) as TraceRecord;
    expect(written0.messages[0].content).toContain("jane.doe@example.com");
  });

  it("Schluessel-Maskierung laeuft vor PII — ein Schluessel darf die PII-Musterphase ueberleben", async () => {
    const { sink, written } = fakeSink();
    const key = "abcd1234567890efgh";
    const withKey: TraceRecord = {
      ...rec,
      messages: [{ role: "user", content: `my api key is ${key} please use it` }],
    };
    await new TraceStore(sink, "lab", limits, () => "2026-08-22").writeNow(withKey, {
      secrets: [key],
      redactPii: true,
    });
    const content = (JSON.parse(written[0].data) as TraceRecord).messages[0].content;
    expect(content).not.toContain("abcd");
    expect(content).not.toContain("efgh");
    expect(content).toContain("••••");
  });

  it("eine Limits-Aenderung zwischen zwei Schreibvorgaengen greift beim zweiten", async () => {
    const removed: string[] = [];
    const sink: TraceSink = {
      append: async () => {},
      list: async () => [{ name: "2026-08-01.jsonl", bytes: 10 }],
      remove: async (p) => {
        removed.push(p);
      },
      read: async () => "",
      write: async () => {},
    };
    let current = { keepDays: 30, maxBytes: 1000 };
    const store = new TraceStore(sink, "lab", () => current, () => "2026-08-22");

    await store.writeNow(rec);
    expect(removed).toEqual([]); // 21 Tage alt, keepDays=30 -> nicht faellig

    current = { keepDays: 7, maxBytes: 1000 };
    await store.writeNow(rec);
    expect(removed).toEqual(["lab/traces/2026-08-01.jsonl"]); // jetzt faellig
  });

  it("rotate() raeumt ueberfaellige Dateien weg, auch ohne einen Schreibvorgang", async () => {
    const removed: string[] = [];
    const sink: TraceSink = {
      append: async () => {
        throw new Error("write() darf hier nie aufgerufen werden");
      },
      list: async () => [{ name: "2026-08-01.jsonl", bytes: 10 }],
      remove: async (p) => {
        removed.push(p);
      },
      read: async () => "",
      write: async () => {},
    };
    const store = new TraceStore(sink, "lab", limits, () => "2026-08-22");
    await store.rotate();
    expect(removed).toEqual(["lab/traces/2026-08-01.jsonl"]);
  });

  it("rotate() reisst nichts mit, wenn die Rotation selbst scheitert", async () => {
    const sink: TraceSink = {
      append: async () => {},
      list: async () => {
        throw new Error("Verzeichnis nicht lesbar");
      },
      remove: async () => {},
      read: async () => "",
      write: async () => {},
    };
    const store = new TraceStore(sink, "lab", limits, () => "2026-08-22");
    await expect(store.rotate()).resolves.toBeUndefined();
  });
});

describe("TraceStore — Schluessel aus dem Aufruf", () => {
  it("maskiert einen mitgelieferten Schluessel im TATSAECHLICH geschriebenen Text", async () => {
    const { sink, written } = fakeSink();
    const store = new TraceStore(sink, "base", limits, () => "2026-08-23");

    const schluessel = "sk-lokal-0123456789abcdef";
    const record: TraceRecord = {
      ...rec,
      messages: [{ role: "user", content: `token ist ${schluessel}` }],
      response: { content: `echo ${schluessel}` },
    };
    await store.writeNow(record, { secrets: [schluessel] });

    const text = written.map((w) => w.data).join("");
    expect(text).not.toContain(schluessel);
    expect(text).toContain("••••");
  });
});

it("liefert beim Lesen einer unbekannten Datei einen leeren String", async () => {
  const { sink } = fakeSink();
  expect(await sink.read("lab/traces/gibtsnicht.jsonl")).toBe("");
});
