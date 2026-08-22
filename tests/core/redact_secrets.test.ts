import { describe, it, expect } from "vitest";
import { redactSecrets, redactRecordSecrets } from "../../src/core/redact_secrets";

describe("redactSecrets", () => {
  it("maskiert einen konfigurierten Schluessel", () => {
    expect(redactSecrets("token=sk-abcdefgh12345", ["sk-abcdefgh12345"]))
      .toBe("token=••••");
  });

  it("maskiert ein Bearer-Echo, dessen Schluessel nirgends konfiguriert ist", () => {
    expect(redactSecrets("Authorization: Bearer xyz789abcdef", []))
      .toBe("Authorization: Bearer ••••");
  });

  it("laesst kurze Zeichenketten in Ruhe — sonst zerschiesst ein 3-Zeichen-Schluessel jeden Text", () => {
    expect(redactSecrets("das ist abc im Satz", ["abc"])).toBe("das ist abc im Satz");
  });
});

describe("redactRecordSecrets", () => {
  it("greift ueber den ganzen Record, nicht Feld fuer Feld", () => {
    const rec = { a: "key sk-abcdefgh12345", nested: { b: "auch sk-abcdefgh12345" } };
    const out = redactRecordSecrets(rec, ["sk-abcdefgh12345"]);
    expect(out.a).toBe("key ••••");
    expect(out.nested.b).toBe("auch ••••");
  });

  it("wirft bei zirkulaerer Referenz (fail-closed design)", () => {
    const circular: Record<string, unknown> = { a: "test" };
    circular.self = circular;
    expect(() => redactRecordSecrets(circular, [])).toThrow();
  });

  it("maskiert Schluessel in verschachtelten Message-Arrays (Produktionsform)", () => {
    type MessageArray = { messages: Array<{ role: string; content: string }> };
    const rec: MessageArray = {
      messages: [
        { role: "user", content: "Frage mit token sk-abcdefgh12345 drin" },
        { role: "assistant", content: "Antwort mit sk-abcdefgh12345 auch" },
      ],
    };
    const out = redactRecordSecrets(rec, ["sk-abcdefgh12345"]);
    expect(out.messages.length).toBe(2);
    expect(out.messages[0].content).toBe("Frage mit token •••• drin");
    expect(out.messages[1].content).toBe("Antwort mit •••• auch");
  });
});
