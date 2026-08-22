import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, shouldLog } from "../../src/core/settings";

describe("DEFAULT_SETTINGS", () => {
  it("schreibt ab Installation mit — sonst waere das Plugin nach der Installation stumm", () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(true);
  });

  it("redigiert PII im Trace standardmaessig NICHT (nur beim Dataset-Uebergang)", () => {
    expect(DEFAULT_SETTINGS.redactPiiInTrace).toBe(false);
  });
});

describe("shouldLog", () => {
  it("schweigt, solange pausiert ist", () => {
    expect(shouldLog("chat", true, DEFAULT_SETTINGS)).toBe(false);
  });

  it("schweigt, wenn das Plugin abgeschaltet ist", () => {
    expect(shouldLog("chat", false, { ...DEFAULT_SETTINGS, enabled: false })).toBe(false);
  });

  it("schweigt fuer ausgeschlossene Features", () => {
    const s = { ...DEFAULT_SETTINGS, excludedFeatures: ["settings-probe"] };
    expect(shouldLog("settings-probe", false, s)).toBe(false);
    expect(shouldLog("chat", false, s)).toBe(true);
  });

  it("schreibt im Normalfall mit", () => {
    expect(shouldLog("chat", false, DEFAULT_SETTINGS)).toBe(true);
  });
});
