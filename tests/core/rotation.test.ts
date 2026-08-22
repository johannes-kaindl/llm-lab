import { describe, it, expect } from "vitest";
import { planRotation } from "../../src/core/rotation";

const limits = { keepDays: 7, maxBytes: 10_000 };
const today = "2026-08-22";

describe("planRotation", () => {
  it("loescht nichts, solange alles innerhalb beider Grenzen liegt", () => {
    const files = [{ name: "2026-08-22.jsonl", bytes: 100 }];
    expect(planRotation(files, limits, today)).toEqual([]);
  });

  it("loescht Dateien, die aelter als keepDays sind", () => {
    const files = [
      { name: "2026-08-01.jsonl", bytes: 100 },
      { name: "2026-08-22.jsonl", bytes: 100 },
    ];
    expect(planRotation(files, limits, today)).toEqual(["2026-08-01.jsonl"]);
  });

  it("loescht bei Ueberschreiten der Groessengrenze die aeltesten zuerst", () => {
    const files = [
      { name: "2026-08-20.jsonl", bytes: 6000 },
      { name: "2026-08-21.jsonl", bytes: 6000 },
      { name: "2026-08-22.jsonl", bytes: 1000 },
    ];
    expect(planRotation(files, limits, today)).toEqual(["2026-08-20.jsonl"]);
  });

  it("verschont die heutige Datei auch dann, wenn sie allein die Grenze reisst", () => {
    const files = [{ name: "2026-08-22.jsonl", bytes: 99_999 }];
    expect(planRotation(files, limits, today)).toEqual([]);
  });

  it("ignoriert Dateien, deren Name kein Datum ist", () => {
    const files = [{ name: "notizen.txt", bytes: 100 }];
    expect(planRotation(files, limits, today)).toEqual([]);
  });
});
