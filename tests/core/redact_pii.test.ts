import { describe, it, expect } from "vitest";
import { redactPii, createPiiRedactor } from "../../src/core/redact_pii";
import type { TraceRecord } from "../../src/core/types";

function makeRecord(overrides: Partial<TraceRecord> = {}): TraceRecord {
  return {
    id: "r1",
    ts: "2026-08-22T10:00:00.000Z",
    plugin: "vault-retrieval",
    feature: "chat",
    model: "qwen3-27b",
    endpointHost: "localhost:1234",
    messages: [{ role: "user", content: "Schreib an a@b.de" }],
    response: { content: "Gesendet an a@b.de" },
    latencyMs: 1200,
    ttftMs: 300,
    ...overrides,
  };
}

describe("redactPii", () => {
  it("ersetzt dieselbe Adresse ueberall im Record durch DENSELBEN Platzhalter", () => {
    const rec = makeRecord();
    const out = redactPii(rec, []);
    expect(out.messages[0]?.content).toBe("Schreib an [EMAIL_1]");
    expect(out.response.content).toBe("Gesendet an [EMAIL_1]");
  });

  it("nummeriert ueber Feldgrenzen hinweg konsistent, auch bei mehreren Adressen je Feld", () => {
    // Zwei Adressen, in beiden Feldern in ENTGEGENGESETZTER Reihenfolge erwaehnt.
    // Eine feldweise (statt record-weite) Nummerierung wuerde in jedem Feld unabhaengig
    // bei 1 anfangen und so den zweiten Feld-Text falsch nummerieren.
    const rec = makeRecord({
      messages: [{ role: "user", content: "Schreib an a@b.de und global@z.de" }],
      response: { content: "Gesendet an global@z.de und a@b.de" },
    });
    const out = redactPii(rec, []);
    expect(out.messages[0]?.content).toBe("Schreib an [EMAIL_1] und [EMAIL_2]");
    expect(out.response.content).toBe("Gesendet an [EMAIL_2] und [EMAIL_1]");
  });

  it("haelt zwei verschiedene Adressen auseinander", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "von a@b.de an c@d.de" }],
      response: { content: "ok" },
    });
    const out = redactPii(rec, []);
    expect(out.messages[0]?.content).toBe("von [EMAIL_1] an [EMAIL_2]");
  });

  it("erkennt IBANs und laesst keine Zifferngruppe davon uebrig", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "DE89 3704 0044 0532 0130 00 ist es" }],
      response: { content: "ok" },
    });
    const out = redactPii(rec, []);
    expect(out.messages[0]?.content).toContain("[IBAN_1]");
    expect(out.messages[0]?.content).not.toContain("3704");
  });

  it("nimmt zusaetzliche Nutzer-Muster entgegen", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "Projekt Zitrone laeuft" }],
      response: { content: "ok" },
    });
    const out = redactPii(rec, ["Zitrone"]);
    expect(out.messages[0]?.content).toBe("Projekt [CUSTOM_1] laeuft");
  });

  // Verhaltenswechsel (code-kit 0.18.0): eigene Begriffe werden dedupliziert und nach Laenge
  // sortiert; frueher galt die Eingabereihenfolge, und "Zitrone" zerschnitt "Zitronenbaum".
  it("ersetzt bei Begriffen, die Praefix voneinander sind, den laengeren ganz", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "Zitronenbaum und Zitrone" }],
      response: { content: "ok" },
    });
    const out = redactPii(rec, ["Zitrone", "Zitronenbaum", "Zitrone"]);
    expect(out.messages[0]?.content).toBe("[CUSTOM_1] und [CUSTOM_2]");
  });

  it("laesst Text ohne Treffer unveraendert", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "nichts hier" }],
      response: { content: "auch nichts" },
    });
    const out = redactPii(rec, []);
    expect(out.messages[0]?.content).toBe("nichts hier");
    expect(out.response.content).toBe("auch nichts");
  });

  it("laesst Metadaten unangetastet — der Anlass der Override", () => {
    // id und latencyMs sind hier bewusst realistisch gewaehlt: ein epoch-basiertes id
    // (13 zusammenhaengende Ziffern) und ein latencyMs ueber 1 Million (ein haengender
    // Request) sind genau die Zifferngruppen, die das PHONE-Muster (>= 7 zusammenhaengende
    // Ziffern) treffen wuerde, wenn ueber JSON.stringify(record) redigiert wuerde — die
    // ISO-Zeitstempel-Form von `ts` allein reicht dafuer NICHT (die Trennzeichen brechen
    // den Zifferlauf unter 7), deshalb muss der Test ueber id/latencyMs gehen, nicht ts.
    const rec = makeRecord({
      id: "1755878401234",
      ts: "2026-08-22T10:00:00.000Z",
      plugin: "vault-retrieval",
      feature: "chat",
      model: "qwen3-27b",
      endpointHost: "localhost:1234",
      latencyMs: 8234567,
      ttftMs: 300,
      finishReason: "stop",
      messages: [{ role: "user", content: "nichts drin" }],
      response: { content: "ok" },
    });
    const out = redactPii(rec, []);
    expect(out.id).toBe(rec.id);
    expect(out.ts).toBe(rec.ts);
    expect(out.plugin).toBe(rec.plugin);
    expect(out.feature).toBe(rec.feature);
    expect(out.model).toBe(rec.model);
    expect(out.endpointHost).toBe(rec.endpointHost);
    expect(out.latencyMs).toBe(rec.latencyMs);
    expect(out.ttftMs).toBe(rec.ttftMs);
    expect(out.finishReason).toBe(rec.finishReason);
    expect(out.messages[0]?.role).toBe("user");
  });

  it("mutiert den Input nicht", () => {
    const rec = makeRecord({
      messages: [{ role: "user", content: "Schreib an a@b.de" }],
      response: { content: "ok" },
    });
    redactPii(rec, []);
    expect(rec.messages[0]?.content).toBe("Schreib an a@b.de");
  });
});

describe("createPiiRedactor", () => {
  it("gibt derselben Adresse in Record UND Korrekturtext denselben Platzhalter", () => {
    const r = createPiiRedactor([]);
    const rec = r.record({
      id: "x", ts: "2026-09-03T00:00:00.000Z", plugin: "p", feature: "f",
      model: "m", endpointHost: "h",
      messages: [{ role: "user", content: "schreib an anna@example.com" }],
      response: { content: "ok" }, latencyMs: 1,
    });
    const korrektur = r.text("besser: Mail an anna@example.com schicken");

    expect(rec.messages[0].content).toContain("[EMAIL_1]");
    expect(korrektur).toContain("[EMAIL_1]");
    expect(korrektur).not.toContain("[EMAIL_2]");
  });

  it("vergibt fuer eine ZWEITE Adresse einen eigenen Platzhalter", () => {
    const r = createPiiRedactor([]);
    r.text("erste: a@example.com");
    expect(r.text("zweite: b@example.com")).toContain("[EMAIL_2]");
  });

  it("redactPii verhaelt sich unveraendert", () => {
    const rec = {
      id: "x", ts: "2026-09-03T00:00:00.000Z", plugin: "p", feature: "f",
      model: "m", endpointHost: "h",
      messages: [{ role: "user" as const, content: "a@example.com" }],
      response: { content: "a@example.com" }, latencyMs: 1,
    };
    const out = redactPii(rec, []);
    expect(out.messages[0].content).toBe("[EMAIL_1]");
    expect(out.response.content).toBe("[EMAIL_1]");
  });
});
