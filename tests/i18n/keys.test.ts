import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "../../src/core/i18n/strings";

/**
 * setLang() runs in onload; module constants are evaluated at import time — earlier.
 * A t() call reachable without first entering a function/arrow/if/for/... body
 * therefore runs during module evaluation (or class definition), before onload can
 * ever call setLang() — and silently freezes that string to whatever the default
 * language was. This file is the ONLY automated defence for that rule.
 *
 * Widened (2026-08-22 review) beyond the original single pattern (which only caught
 * `const NAME = ...t(...)` at module level) to also catch:
 *   - `let`/`var` declarations at module level, not just `const`
 *   - `export default { ...t(...) }` object literals
 *   - class fields declared directly in a class body (`label = t("x")`), which have
 *     no `const`/`let`/`var` keyword at all and are bounded by `{`/`}`, not `;`
 *
 * Known blind spot, left deliberately unfixed: a `;` embedded inside a template
 * literal before the real statement end (e.g. `` const x = `foo;\n${t("x")}`; ``)
 * makes the semicolon-bounded scan below stop before it reaches the real `t(` call —
 * a false negative. Making the scan template-literal-aware would need a small
 * string/comment-stripping tokenizer over the whole file, which is exactly the kind
 * of machinery this guard is meant to stay without: a text scan, not a parser. This
 * shape stays undetected on purpose, not by oversight — the next person extending
 * this file should read this as the guard's real reach, not assume total coverage.
 */
function moduleLevelDeclOffender(src: string): boolean {
  // const/let/var NAME = ...t(...)  — the original guard, widened to let/var.
  if (/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*[^;]*\bt\(/m.test(src)) return true;
  // export default { ...t(...) }  (or export default someCall(...t(...)))
  if (/^export\s+default\s+[^;]*\bt\(/m.test(src)) return true;
  return false;
}

/**
 * Class fields declared directly in a class body run once per instance — but a class
 * with no constructor args instantiated at module scope, or a field whose value is a
 * plain literal/object (not a function), still evaluates that value eagerly.
 *
 * Telling "directly in the class body" apart from "inside one of the class's own
 * method/getter/setter bodies" (where a `t()` call is exactly the correct, deferred
 * pattern — e.g. `get label() { return t("x"); }`) needs more than a single regex, so
 * this walks brace depth from each `class … {`: a `{` immediately preceded by `)` or
 * `=>` opens a method/getter/setter/arrow body one level below the class's own brace —
 * its contents are skipped, not tested. Anything else sitting directly at that first
 * level — a field initializer, including one whose value is itself a nested
 * object/array literal — is a real offender if it contains `t(`.
 */
function classFieldOffender(src: string): boolean {
  const fieldPattern =
    /^\s*(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+)*\w+\s*[?!]?\s*(?::[^=]*)?=\s*[^;]*\bt\(/;
  const classOpen = /\bclass\s+\w+(?:\s+extends\s+[\w.$]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = classOpen.exec(src)) !== null) {
    let depth = 1; // already one level inside the class's own opening brace
    let fieldStart = m.index + m[0].length;
    let inMethodBody = false;
    for (let i = fieldStart; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === "{") {
        const opensMethodBody = /(?:\)|=>)\s*$/.test(src.slice(Math.max(0, i - 40), i));
        depth++;
        if (depth === 2 && opensMethodBody) inMethodBody = true;
      } else if (ch === "}") {
        const closesClassItself = depth === 1;
        depth--;
        if (closesClassItself) {
          // trailing field before the class ends, with no ";" to bound it
          const stmt = src.slice(fieldStart, i);
          if (!inMethodBody && fieldPattern.test(stmt)) return true;
        } else if (depth === 1 && inMethodBody) {
          // returned from a method/getter/setter/arrow body to class-body level
          inMethodBody = false;
          fieldStart = i + 1;
        }
      } else if (ch === ";" && depth === 1 && !inMethodBody) {
        const stmt = src.slice(fieldStart, i);
        if (fieldPattern.test(stmt)) return true;
        fieldStart = i + 1;
      }
    }
  }
  return false;
}

describe("i18n", () => {
  it("fuehrt in DE genau die Schluessel, die EN kennt", () => {
    expect(Object.keys(STRINGS.de).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });

  it("ruft t() nirgends auf Modul-Ebene auf", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((e) => {
        const f = join(d, e);
        return statSync(f).isDirectory() ? walk(f) : f.endsWith(".ts") ? [f] : [];
      });
    const offenders = walk("src").filter((f) => {
      const src = readFileSync(f, "utf8");
      return moduleLevelDeclOffender(src) || classFieldOffender(src);
    });
    expect(offenders).toEqual([]);
  });
});
