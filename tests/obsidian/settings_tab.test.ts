import { describe, it, expect, vi } from "vitest";
import { LabSettingTab } from "../../src/obsidian/settings_tab";
import { setLang, t } from "../../src/vendor/kit/i18n";
// Side-Effect-Import: registriert die echten EN/DE-Strings bei t().
import "../../src/core/i18n/strings";

type Def = { name?: string; render?: (setting: unknown) => void };

/** Faengt Name, Beschreibung, Knopftext und die beiden Klick-Handler der Hilfe-Zeile ab. */
function fakeSetting() {
  const seen = { name: "", desc: "", buttonText: "", tooltip: "", clicks: [] as Array<() => void> };
  const chain: Record<string, unknown> = {
    setName: (v: string) => ((seen.name = v), chain),
    setDesc: (v: string) => ((seen.desc = v), chain),
    addButton: (cb: (b: unknown) => void) => {
      const b: Record<string, unknown> = {
        setButtonText: (v: string) => ((seen.buttonText = v), b),
        onClick: (h: () => void) => (seen.clicks.push(h), b),
      };
      cb(b);
      return chain;
    },
    addExtraButton: (cb: (b: unknown) => void) => {
      const b: Record<string, unknown> = {
        setIcon: () => b,
        setTooltip: (v: string) => ((seen.tooltip = v), b),
        onClick: (h: () => void) => (seen.clicks.push(h), b),
      };
      cb(b);
      return chain;
    },
  };
  return { chain, seen };
}

function tabDefinitions(): Def[] {
  const plugin = { settings: {} } as never;
  return new LabSettingTab({} as never, plugin).getSettingDefinitions() as Def[];
}

describe("LabSettingTab: Hilfe-Zeile", () => {
  it("steht als erstes Element und oeffnet Doku-Index und Issues dieses Repos", () => {
    setLang("en");
    const first = tabDefinitions()[0]!;
    expect(first.name).toBe("Help");
    const { chain, seen } = fakeSetting();
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    first.render?.(chain);
    expect(seen.buttonText).toBe("Open documentation");
    for (const h of seen.clicks) h();
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/johannes-kaindl/llm-lab/blob/main/docs/README.md",
      "https://github.com/johannes-kaindl/llm-lab/issues",
    ]);
    vi.unstubAllGlobals();
  });

  it("spricht die Sprache des Tabs (DE)", () => {
    setLang("de");
    const first = tabDefinitions()[0]!;
    expect(first.name).toBe("Hilfe");
    expect(t("help.openDocs")).toBe("Dokumentation öffnen");
    setLang("en");
  });
});
