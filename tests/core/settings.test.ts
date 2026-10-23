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

  // Datenschutzgrenze, Kit `folder-scope` mit `reading: "filesystem"` (Welle 25): ein Pfad, der auf der Platte im ausgeschlossenen Ordner landet,
  // zählt als ausgeschlossen, auch wenn er anders geschrieben ist.
  it.each([
    "Privat/b.md", "privat/b.md", "PRIVAT/b.md", "Privat /b.md", "Privat./b.md", "Privat . /b.md", "Privat:x/b.md",
    "Privat\u00a0/b.md", "Privat\u202f/b.md", "Privat/tief/b.md", "Privat",
  ])("schliesst %s aus, wenn „Privat“ ausgeschlossen ist", (pfad) => {
    expect(pathsExcluded([pfad], mit({ excludedFolders: ["Privat"] }))).toBe(true);
  });

  it("schliesst auch ohne Unicode-Normalform-Gleichheit aus (Ü als ein oder zwei Zeichen) und mit Eszett/langem s", () => {
    expect(pathsExcluded(["\u00dcber/a.md"], mit({ excludedFolders: ["U\u0308ber"] }))).toBe(true);
    expect(pathsExcluded(["Stra\u00dfe/a.md"], mit({ excludedFolders: ["STRASSE"] }))).toBe(true);
    expect(pathsExcluded(["Priva\u017f/a.md"], mit({ excludedFolders: ["Privas"] }))).toBe(true);
  });

  it("ein Schrägstrich am Ende der Einstellung ändert nichts (vorher: „Privat/“ traf nichts)", () => {
    expect(pathsExcluded(["Privat/b.md"], mit({ excludedFolders: ["Privat/"] }))).toBe(true);
  });

  it("Gegenprobe: ähnliche Namen bleiben draussen", () => {
    const s = mit({ excludedFolders: ["Privat"] });
    for (const p of ["Privat2/b.md", "Privates/b.md", "Notizen/Privat.md", "Notizen/Privat/b.md", "Priv at/b.md"]) {
      expect(pathsExcluded([p], s), p).toBe(false);
    }
  });

  it("eine leere Ordner-Zeile schliesst NICHT den ganzen Vault aus", () => {
    // Ein leerer String waere als Praefix auf jeden Pfad wahr — der haeufigste
    // Weg, aus einem Tippfehler ein stummes Plugin zu machen.
    const s = mit({ excludedFolders: ["", "   "] });
    expect(pathsExcluded(["irgendwas.md"], s)).toBe(false);
  });
});
