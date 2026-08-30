import { describe, it, expect } from "vitest";
import { buildTraceRecord, hashPrompt } from "../../src/core/record";

const input = {
  id: "t1",
  ts: "2026-08-22T10:00:00.000Z",
  plugin: "vault-retrieval",
  feature: "chat",
  model: "qwen3-27b",
  endpointUrl: "http://localhost:1234/v1/chat/completions?key=geheim",
  messages: [
    { role: "system" as const, content: "Du bist knapp." },
    { role: "user" as const, content: "Was ist X?" },
  ],
  content: "X ist Y.",
  reasoning: "denk denk",
  finishReason: "stop",
  latencyMs: 1200,
  ttftMs: 300,
};

describe("buildTraceRecord", () => {
  it("behaelt nur den Host des Endpunkts — nie Pfad, Query oder Schluessel", () => {
    expect(buildTraceRecord(input).endpointHost).toBe("localhost:1234");
  });

  it("trennt Antwort und Reasoning", () => {
    const r = buildTraceRecord(input);
    expect(r.response.content).toBe("X ist Y.");
    expect(r.response.reasoning).toBe("denk denk");
  });

  it("haelt finishReason fest — die einzige Stelle, an der Token-Limit von schlechter Antwort unterscheidbar ist", () => {
    expect(buildTraceRecord({ ...input, finishReason: "length" }).finishReason).toBe("length");
  });

  it("schreibt auch einen Abbruch — der interessante Debug-Fall ist der gescheiterte", () => {
    const r = buildTraceRecord({ ...input, content: "", error: "aborted" });
    expect(r.error).toBe("aborted");
  });

  it("unterscheidet zwei Prompt-Fassungen am promptTemplate", () => {
    const a = buildTraceRecord({ ...input, promptTemplate: "Du bist knapp." });
    const b = buildTraceRecord({ ...input, promptTemplate: "Du bist ausfuehrlich." });
    expect(a.promptTemplateHash).toBeDefined();
    expect(a.promptTemplateHash).not.toBe(b.promptTemplateHash);
  });

  it("haelt den Hash stabil, wenn nur der Kontext in der System-Nachricht wechselt — der Befund vom 2026-08-23", () => {
    const userMsg = input.messages[1];
    const mit = (kontext: string) => buildTraceRecord({
      ...input,
      promptTemplate: "Du bist knapp.",
      messages: [{ role: "system" as const, content: `Du bist knapp.\n\n${kontext}` }, userMsg],
    });
    expect(mit("Notiz A").promptTemplateHash).toBe(mit("Notiz B").promptTemplateHash);
  });

  it("laesst den Hash weg, wenn kein promptTemplate gemeldet wird — auch bei vorhandener System-Nachricht", () => {
    const r = buildTraceRecord(input);
    expect(r.promptTemplateHash).toBeUndefined();
  });
});

describe("hashPrompt", () => {
  it("ist stabil ueber Aufrufe", () => {
    expect(hashPrompt("abc")).toBe(hashPrompt("abc"));
  });
});
