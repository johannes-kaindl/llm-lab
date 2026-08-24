import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, pathsExcluded, shouldLog } from "../../src/core/settings";

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
    expect(shouldLog({ feature: "chat" }, true, DEFAULT_SETTINGS)).toBe(false);
  });

  it("schweigt, wenn das Plugin abgeschaltet ist", () => {
    expect(shouldLog({ feature: "chat" }, false, { ...DEFAULT_SETTINGS, enabled: false })).toBe(
      false,
    );
  });

  it("schweigt fuer ausgeschlossene Features", () => {
    const s = { ...DEFAULT_SETTINGS, excludedFeatures: ["settings-probe"] };
    expect(shouldLog({ feature: "settings-probe" }, false, s)).toBe(false);
    expect(shouldLog({ feature: "chat" }, false, s)).toBe(true);
  });

  it("schreibt im Normalfall mit", () => {
    expect(shouldLog({ feature: "chat" }, false, DEFAULT_SETTINGS)).toBe(true);
  });

  it("schweigt, wenn ein beteiligter Pfad ausgeschlossen ist", () => {
    const s = { ...DEFAULT_SETTINGS, excludedFolders: ["Privat"] };
    expect(shouldLog({ feature: "chat", contextPaths: ["Privat/a.md"] }, false, s)).toBe(false);
    expect(shouldLog({ feature: "chat", contextPaths: ["Notizen/a.md"] }, false, s)).toBe(true);
  });

  it("schreibt ohne contextPaths weiterhin mit, auch bei konfiguriertem Ordner-Ausschluss", () => {
    const s = { ...DEFAULT_SETTINGS, excludedFolders: ["Privat"] };
    expect(shouldLog({ feature: "chat" }, false, s)).toBe(true);
  });
});

describe("DEFAULT_SETTINGS — Ordner-Filter", () => {
  it("schliesst per Default keinen Ordner aus (der Filter ist aus, bis jemand ihn fuellt)", () => {
    expect(DEFAULT_SETTINGS.excludedFolders).toEqual([]);
  });

  it("ist per Default streng: ein Treffer genuegt", () => {
    expect(DEFAULT_SETTINGS.strictFolderExclusion).toBe(true);
  });
});

describe("pathsExcluded", () => {
  const mit = (over: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...over });

  it("schliesst nichts aus, solange keine Ordner konfiguriert sind", () => {
    expect(pathsExcluded(["Privat/Tagebuch.md"], DEFAULT_SETTINGS)).toBe(false);
  });

  it("greift nicht ohne Pfade — fail-open, sonst verstummt jeder Konsument ohne Pfad-Feld", () => {
    const s = mit({ excludedFolders: ["Privat"] });
    expect(pathsExcluded(undefined, s)).toBe(false);
    expect(pathsExcluded([], s)).toBe(false);
  });

  it("streng: EIN Treffer genuegt", () => {
    const s = mit({ excludedFolders: ["Privat"], strictFolderExclusion: true });
    expect(pathsExcluded(["Notizen/a.md", "Privat/b.md"], s)).toBe(true);
  });

  it("mild: nur wenn ALLE beteiligten Notizen ausgeschlossen sind", () => {
    const s = mit({ excludedFolders: ["Privat"], strictFolderExclusion: false });
    expect(pathsExcluded(["Notizen/a.md", "Privat/b.md"], s)).toBe(false);
    expect(pathsExcluded(["Privat/a.md", "Privat/b.md"], s)).toBe(true);
  });

  it("respektiert die Ordnergrenze: „Privat\" schluckt nicht „Privates.md\"", () => {
    const s = mit({ excludedFolders: ["Privat"] });
    expect(pathsExcluded(["Privates.md"], s)).toBe(false);
    expect(pathsExcluded(["Privat-Alt/b.md"], s)).toBe(false);
    expect(pathsExcluded(["Privat"], s)).toBe(true);
    expect(pathsExcluded(["Privat/tief/b.md"], s)).toBe(true);
  });

  it("normalisiert Pfade und Ordner (fuehrender Slash, Backslashes, Randweissraum)", () => {
    const s = mit({ excludedFolders: [" /Privat/Unterordner ", ""] });
    expect(pathsExcluded(["Privat\\Unterordner\\b.md"], s)).toBe(true);
    expect(pathsExcluded(["/Privat/Unterordner/b.md"], s)).toBe(true);
  });

  it("eine leere Ordner-Zeile schliesst NICHT den ganzen Vault aus", () => {
    // Ein leerer String waere als Praefix auf jeden Pfad wahr — der haeufigste
    // Weg, aus einem Tippfehler ein stummes Plugin zu machen.
    const s = mit({ excludedFolders: ["", "   "] });
    expect(pathsExcluded(["irgendwas.md"], s)).toBe(false);
  });
});
