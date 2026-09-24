import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";
import pkg from "../package.json";

describe("manifest", () => {
  it("traegt die im Store geprueften Kennungen", () => {
    expect(manifest.id).toBe("llm-lab");
    expect(manifest.name).toBe("LLM Lab");
  });

  it("zeigt authorUrl auf den Dach-Sollwert (GitHub-Profil, seit der Store-Rueckkehr 2026-09-24)", () => {
    expect(manifest.authorUrl).toBe("https://github.com/johannes-kaindl");
  });

  it("haelt Manifest- und package-Version synchron", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
