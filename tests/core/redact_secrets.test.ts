import { describe, it, expect } from "vitest";
import { redactKeys as redactSecrets, redactKeysInValue as redactRecordSecrets } from "../../src/vendor/kit/redact";

describe("redactKeys (Kit)", () => {
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

describe("redactKeysInValue (Kit)", () => {
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

  it("maskiert einen Schluessel mit Sonderzeichen trotz JSON-Escaping (kein stiller Leak)", () => {
    const key = 'sk-abc"def/ghi123';
    const rec = { a: `key ${key} im Text` };
    const out = redactRecordSecrets(rec, [key]);
    expect(out.a).toBe("key •••• im Text");
    expect(out.a).not.toContain(key);
  });

  it("maskiert einen Schluessel mit Backslash (JSON verdoppelt ihn — rohe Nadel matcht nie)", () => {
    const key = "sk-abc\\def12345";
    const out = redactRecordSecrets({ a: `key ${key} im Text` }, [key]);
    expect(out.a).toBe("key •••• im Text");
    expect(out.a).not.toContain(key);
  });

  it("maskiert einen Schluessel mit Zeilenumbruch (JSON schreibt \\n als zwei Zeichen)", () => {
    const key = "sk-abc\ndef12345";
    const out = redactRecordSecrets({ a: `key ${key} im Text` }, [key]);
    expect(out.a).toBe("key •••• im Text");
    expect(out.a).not.toContain(key);
  });

  it("maskiert einen Schluessel mit Steuerzeichen (Tab)", () => {
    const key = "sk-abc\tdef12345";
    const out = redactRecordSecrets({ a: `key ${key} im Text` }, [key]);
    expect(out.a).toBe("key •••• im Text");
    expect(out.a).not.toContain(key);
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

// Verhaltenswechsel gegenueber der alten Fassung (code-kit 0.18.0), absichtlich anders gepinnt.
describe("Kit-Fassung: gemessene Unterschiede", () => {
  it("maskiert einen Schluessel ganz, auch wenn ein anderer sein Praefix ist", () => {
    const out = redactSecrets("key sk-praefix-12345678-SECRETSUFFIX99 rejected", ["sk-praefix-12345678", "sk-praefix-12345678-SECRETSUFFIX99"]);
    expect(out).toBe("key •••• rejected");
    expect(out).not.toContain("SECRETSUFFIX99");
  });

  it("laesst `$&` in der Maske woertlich stehen, statt es zu expandieren", () => {
    expect(redactSecrets("token=sk-abcdefgh12345", ["sk-abcdefgh12345"], { mask: "<$&>" })).toBe("token=<$&>");
  });
});
