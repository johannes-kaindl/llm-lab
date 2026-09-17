import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";
import pkg from "../package.json";

describe("manifest", () => {
  it("traegt die im Store geprueften Kennungen", () => {
    expect(manifest.id).toBe("llm-lab");
    expect(manifest.name).toBe("LLM Lab");
  });

  it("zeigt authorUrl auf den Dach-Sollwert (eigene Domain statt des aufgegebenen GitHub-Profils)", () => {
    expect(manifest.authorUrl).toBe("https://jkaindl.de");
  });

  it("haelt Manifest- und package-Version synchron", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
