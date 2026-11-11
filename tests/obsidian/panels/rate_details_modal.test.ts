import { describe, it, expect, vi } from "vitest";
import "../../../src/core/i18n/strings";

// Eine Setting-Attrappe, die die Rückrufe wirklich bedient: addText/addTextArea reichen eine Komponente mit
// onChange weiter, addButton eine mit onClick. Die gemeinsame Attrappe tut das nicht (sie ist ein Stub).
const fake = vi.hoisted(() => ({ onChange: [] as Array<(v: string) => void>, clicks: [] as Array<() => void> }));
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class FakeSetting {
    constructor(_el: unknown) {}
    setName(): this { return this; }
    setDesc(): this { return this; }
    setClass(): this { return this; }
    addText(cb: (c: unknown) => void): this { cb({ onChange: (fn: (v: string) => void) => { fake.onChange.push(fn); } }); return this; }
    addTextArea(cb: (c: unknown) => void): this { cb({ onChange: (fn: (v: string) => void) => { fake.onChange.push(fn); }, inputEl: {} }); return this; }
    addButton(cb: (c: unknown) => void): this {
      const b = { setButtonText: () => b, setCta: () => b, onClick: (fn: () => void) => { fake.clicks.push(fn); return b; } };
      cb(b);
      return this;
    }
  }
  return { ...original, Setting: FakeSetting };
});

import { RateDetailsModal } from "../../../src/obsidian/panels/rate_details_modal";
import type { RateInput } from "../../../src/core/dataset";

/** Öffnet den Dialog, tippt die Tag-Zeile und bestätigt; gibt die gespeicherten Tags zurück. */
function tagsFor(typed: string): string[] | null {
  fake.onChange.length = 0;
  fake.clicks.length = 0;
  let result: RateInput | null = null;
  const modal = new RateDetailsModal({} as never, "good" as never, (r) => { result = r; });
  modal.open();
  fake.onChange[0]?.(typed); // erstes Feld: die Tags
  fake.clicks[1]?.(); // zweiter Knopf: Speichern
  return result === null ? null : (result as RateInput).tags;
}

describe("RateDetailsModal — Tag-Zeile", () => {
  it("zerlegt an Kommas, ignoriert Leerraum und leere Einträge", () => {
    expect(tagsFor("a, b")).toEqual(["a", "b"]);
    expect(tagsFor(" a ,, b , ")).toEqual(["a", "b"]);
    expect(tagsFor(",a,")).toEqual(["a"]);
    expect(tagsFor("a\t,\nb")).toEqual(["a", "b"]);
  });
  it("eine Zeile aus nichts als Trennzeichen und Leerraum ergibt keine Tags", () => {
    expect(tagsFor("")).toEqual([]);
    expect(tagsFor(",")).toEqual([]);
    expect(tagsFor(" , , ")).toEqual([]);
  });
  it("trennt nur am Komma", () => {
    expect(tagsFor("a b")).toEqual(["a b"]);
    expect(tagsFor("a;b")).toEqual(["a;b"]);
  });
  it("Abbrechen liefert null und keine halbe Bewertung", () => {
    fake.onChange.length = 0; fake.clicks.length = 0;
    let result: RateInput | null | "offen" = "offen";
    const modal = new RateDetailsModal({} as never, "good" as never, (r) => { result = r; });
    modal.open();
    fake.onChange[0]?.("a");
    fake.clicks[0]?.(); // erster Knopf: Abbrechen
    expect(result).toBeNull();
  });
});
