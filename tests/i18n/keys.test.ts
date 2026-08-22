import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "../../src/core/i18n/strings";

describe("i18n", () => {
  it("fuehrt in DE genau die Schluessel, die EN kennt", () => {
    expect(Object.keys(STRINGS.de).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });

  it("ruft t() nirgends auf Modul-Ebene auf", () => {
    // setLang() laeuft in onload, Modul-Konstanten werden beim import ausgewertet —
    // davor. Ein t() auf Modul-Ebene friert die Sprache still auf "en" ein.
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const f = join(d, e);
        return statSync(f).isDirectory() ? walk(f) : f.endsWith(".ts") ? [f] : [];
      });
    const offenders = walk("src").filter((f) => {
      const src = readFileSync(f, "utf8");
      return /^(?:export\s+)?const\s+\w+\s*=\s*[^;]*\bt\(/m.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
