import { describe, it, expect, vi } from "vitest";
import { createLlmLabApi, LLM_LAB_API_VERSION, type ApiDeps } from "../src/plugin_api";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { TraceStore, WriteOptions } from "../src/core/trace_store";
import type { TraceRecord } from "../src/core/types";

/** Minimaler Fake, der nur die Store-Teile traegt, die die API tatsaechlich anfasst
 *  (`write`) — als `TraceStore` getypt statt gecastet, damit ein falscher Aufruf
 *  hier schon der Compiler meldet. */
function makeFakeStore() {
  const write = vi.fn<(record: TraceRecord, opts?: WriteOptions) => void>();
  const store: Pick<TraceStore, "write"> = { write };
  return { store: store as TraceStore, write };
}

function makeApi(over: Partial<ApiDeps> = {}) {
  const { store, write } = makeFakeStore();
  const api = createLlmLabApi({
    store: () => store,
    settings: () => DEFAULT_SETTINGS,
    paused: () => false,
    secrets: () => [],
    now: () => "2026-08-22T10:00:00.000Z",
    newId: () => "id-1",
    ...over,
  });
  return { api, write };
}

const input = {
  plugin: "vault-retrieval", feature: "chat", model: "m",
  endpointUrl: "http://localhost:1234/v1/chat/completions",
  messages: [{ role: "user" as const, content: "hi" }],
  content: "ho", latencyMs: 5,
};

describe("LlmLabApi", () => {
  it("meldet die Vertragsversion", () => {
    expect(makeApi().api.apiVersion).toBe(LLM_LAB_API_VERSION);
  });

  it("gibt die id SYNCHRON zurueck — ein Promise zwaenge Konsumenten zum await", () => {
    const { api } = makeApi();
    expect(api.log(input)).toBe("id-1");
  });

  it("reicht den Record an den Store weiter", () => {
    const { api, write } = makeApi();
    api.log(input);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].feature).toBe("chat");
  });

  it("schreibt nichts, solange pausiert ist — gibt aber trotzdem eine id zurueck", () => {
    const { api, write } = makeApi({ paused: () => true });
    expect(typeof api.log(input)).toBe("string");
    expect(write).not.toHaveBeenCalled();
  });

  it("status() ist synchron und netzfrei", () => {
    const s = makeApi().api.status();
    expect(s).toEqual({ apiVersion: 1, recording: true });
  });

  it("verdrahtet redactPiiInTrace/customPiiTerms in die WriteOptions des Stores", () => {
    const { api, write } = makeApi({
      settings: () => ({ ...DEFAULT_SETTINGS, redactPiiInTrace: true, customPiiTerms: ["Acme"] }),
    });
    api.log(input);
    expect(write.mock.calls[0][1]).toEqual({
      secrets: [],
      redactPii: true,
      piiTerms: ["Acme"],
    });
  });

  it("meldet redactPii: false bei den Standard-Einstellungen", () => {
    const { api, write } = makeApi();
    api.log(input);
    expect(write.mock.calls[0][1]).toEqual({
      secrets: [],
      redactPii: false,
      piiTerms: [],
    });
  });

  it("wirft nie — auch bei fehlerhaftem Input liefert log() eine id", () => {
    // buildTraceRecord() liest input.messages.find(...) unbewacht; ein Konsument, der
    // hier etwas Falsches uebergibt, darf trotzdem nie in seinem eigenen Streaming-Pfad
    // reissen. Der Cast ueber unknown ist bewusst: ein echter Fremdplugin-Aufruf kommt
    // ohne Typprüfung durch die Plugin-Grenze.
    const malformed = { ...input, messages: "not-an-array" } as unknown as typeof input;
    const { api, write } = makeApi();
    let id: string | undefined;
    expect(() => {
      id = api.log(malformed);
    }).not.toThrow();
    expect(typeof id).toBe("string");
    expect(write).not.toHaveBeenCalled();
  });
});
