import { describe, it, expect } from "vitest";
import { redactPii } from "../../src/core/redact_pii";
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
