import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "../../src/core/i18n/strings";

// Der Waechter unten (stripStringContents/stripLineComment/braceKind/moduleLevelTCalls samt
// Selbsttests) ist uebernommen aus vault-rag/tests/i18n/keys.test.ts, 2026-08-30.
//
// setLang() laeuft in onload; Modul-Konstanten werden beim Import ausgewertet — frueher. Ein
// t()-Aufruf, der ohne vorheriges Betreten eines Funktions-/Arrow-Rumpfs erreichbar ist, laeuft
// also waehrend der Modul-Auswertung (oder der Klassen-Instanziierung), bevor onload je setLang()
// rufen konnte — und friert den String still auf die Default-Sprache ein. Diese Datei ist die
// EINZIGE automatische Verteidigung dieser Regel.
//
// **Warum uebernommen statt weiterentwickelt (2026-08-30).** Diese Datei trug zwei getrennte
// Textscanner: `moduleLevelDeclOffender` (Regex je Deklarationsform) und `classFieldOffender`
// (eigener Klammer-Walker nur fuer Klassenruempfe). Beide meldeten einen **Ausdrucks-Arrow**
// faelschlich — `const f = (): string => t("k")` ebenso wie das Klassenfeld
// `getLabel = (): string => t("k")` —, obwohl dessen Rumpf erst beim Aufruf laeuft. Gemeldet
// aus der vault-rag-Session 2026-08-23 fuer den Klassenfeld-Fall; beim Bau des roten
// Selbsttests fiel auf, dass **auch die Modul-Ebene** betroffen war, also beide Scanner.
//
// vault-rags Fassung loest das in EINEM Klammer-Tiefen-Tracker, dessen Stack `"fn"`/`"class"`/
// `"other"` unterscheidet — und hat die Klassenfeld-Erkennung, die frueher nur hier stand,
// inzwischen selbst (`braceKind` liefert fuer einen Klassenrumpf bewusst NICHT `"fn"`). Damit
// war sie in beiden Punkten die reichere Fassung; zwei Scanner nebeneinander weiterzupflegen
// waere die schlechtere Wahl gewesen. Der frueher hier dokumentierte Rueckportier-Kandidat
// ist damit erledigt — in der anderen Richtung.
//
// Bekannte Grenzen sind in den Docblocks unten benannt (mehrzeilige Template-Literale,
// mehrzeilige Funktionskoepfe). Der Waechter ist ein Textscanner, kein Parser — das ist
// Absicht, und die Selbsttests sind die Stelle, an der seine Reichweite nachlesbar ist.

/**
 * Ersetzt String-/Template-Literal-Inhalte durch ihre öffnenden/schließenden Anführungszeichen
 * (Inhalt verworfen) — damit Klammern/Kommentar-Marker *innerhalb* eines Literals die
 * brace-Zählung bzw. die Kommentarerkennung nicht verfälschen. Bekannte Lücke: mehrzeilige
 * Template-Literale und `${…}`-Interpolationen innerhalb eines Template-Literals werden nicht
 * aufgelöst (das Literal wird als ein Block bis zum nächsten gleichen Anführungszeichen auf
 * derselben Zeile behandelt) — im Repo bislang nicht in einer Form aufgetreten, die die
 * brace-Zählung stören würde.
 */
function stripStringContents(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += quote;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === "\\") i++;
        i++;
      }
      if (i < line.length) { out += line[i]; i++; }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Entfernt einen `//`-Zeilenkommentar (String-Inhalte müssen vorher bereits entfernt sein). */
function stripLineComment(codeOnlyLine: string): string {
  const idx = codeOnlyLine.indexOf("//");
  return idx === -1 ? codeOnlyLine : codeOnlyLine.slice(0, idx);
}

/**
 * Entfernt `/* … *\/`-Bereiche, ueber Zeilengrenzen hinweg (`inBlock` traegt den Zustand von
 * Zeile zu Zeile). ERGAENZUNG gegenueber der uebernommenen Fassung — dort fehlte sie, weil
 * vault-rag `src/vendor/` ausklammert und der Fall deshalb nie auftrat.
 *
 * Ohne diesen Schritt meldet der Waechter ein `t("…")` in einem Doc-Kommentar als eifrigen
 * Aufruf. Gemessen an `src/vendor/kit/i18n.ts:25` (`* @example t("view.cardHead", 3, 7, "foo")`),
 * aber die Falle ist nicht vendor-spezifisch: ein `@example` im eigenen Code trifft sie genauso.
 * Das Verzeichnis auszuklammern haette den Befund versteckt statt behoben — und dabei den
 * Waechter fuer die vendorierten Dateien ganz abgeschaltet.
 *
 * ⚠️ Reihenfolge: Block-Kommentare werden VOR den String-Literalen entfernt. Beide Richtungen
 * haben einen Fehlerfall, aber ungleich wahrscheinliche: ein Kommentar, der ein
 * Anfuehrungszeichen enthaelt, ist Alltag (genau der Fund oben) — dort wuerde ein
 * vorgezogener String-Stripper das `*\/` mitverschlucken. Ein String-Literal, das `/*`
 * enthaelt, ist die Ausnahme; dort oeffnet dieser Schritt faelschlich einen Kommentar. Im
 * Repo kommt der zweite Fall nicht vor, der erste schon.
 */
function stripBlockComments(line: string, inBlock: boolean): { code: string; inBlock: boolean } {
  let out = "";
  let i = 0;
  let open = inBlock;
  while (i < line.length) {
    if (open) {
      const end = line.indexOf("*\/", i);
      if (end === -1) return { code: out, inBlock: true };
      i = end + 2;
      open = false;
      continue;
    }
    const start = line.indexOf("/*", i);
    if (start === -1) { out += line.slice(i); break; }
    out += line.slice(i, start);
    i = start + 2;
    open = true;
  }
  return { code: out, inBlock: open };
}

/**
 * Klassifiziert eine öffnende `{`: "fn" (Funktions-/Methoden-/Arrow-Körper — Inhalt wird erst bei
 * *Aufruf* ausgewertet, also sicher), "class" (Klassenrumpf — Feldinitialisierer darin laufen
 * eifrig) oder "other" (Objekt-/Array-Literal, Block, Kontrollfluss — Inhalt wird sofort beim
 * Modul-Load ausgewertet, also unsicher).
 * `prefix` ist der (bereits string-/kommentarbereinigte) Zeilentext vor der `{`.
 * Heuristik, kein Parser — bekannte Lücke: `if/for/while/switch/catch (…) {` wird korrekt als
 * "nicht Funktion" erkannt, ein mehrzeiliger Funktionskopf (Parameterliste über mehrere Zeilen)
 * wird dagegen als "nicht Funktion" fehlklassifiziert, weil die schließende `)` nicht auf
 * derselben Zeile wie die `{` steht.
 */
function braceKind(prefix: string): "fn" | "class" | "other" {
  const p = prefix.trimEnd();
  if (/=>$/.test(p)) return "fn"; // Arrow-Function-Körper
  if (/\b(if|for|while|switch|catch)\s*\([^{]*\)$/.test(p)) return "other"; // Kontrollfluss
  // Rückgabetyp bewusst als `.+` statt `[^{]+`: ein Typ darf selbst geschweifte Klammern tragen
  // (`): Promise<{ a: string }>`), und mit `[^{]+` wurde der Body-Öffner dann als Objektliteral
  // eingestuft — der ganze Methodenrumpf galt als Modul-Ebene. Die Typ-internen `{` bekommen
  // dabei ebenfalls "fn"; das ist harmlos, weil ihre `}` sie sauber wieder abräumen.
  if (/\)\s*(:\s*.+)?$/.test(p)) return "fn"; // function/Methode/Konstruktor, ggf. mit Rückgabetyp
  // Klassenrumpf ist NICHT "fn": ein blankes Feld (`label = t("x")`) wird bei der Instanziierung
  // ausgewertet, also potenziell vor setLang(). Nur die Methoden-/Getter-Rümpfe DARIN sind
  // verzögert — die bekommen beim Öffnen ihrer eigenen `{` selbst ein "fn".
  if (/\bclass\b/.test(p)) return "class";
  return "other"; // Objekt-/Array-Literal, nackter Block, …
}

/**
 * Alle t(…)-Aufrufe einer Datei, die beim Modul-Load ausgewertet werden (statt erst bei
 * späterem Funktionsaufruf) — per Klammer-Tiefen-Tracking über die ganze Datei: sobald eine
 * öffnende `{` einem Funktions-/Methoden-/Klassenkopf gehört, gilt alles darin (bis zur
 * passenden `}`) als "hinter einem Aufruf verzögert", auch wenn dort z.B. ein Objekt-Literal
 * mit t(…)-Werten steht. Zeichen-für-Zeichen statt Zeilen-für-Zeilen: die Tiefe wird an der
 * *Stelle des t(-Treffers* ausgewertet, nicht am Zeilenanfang — sonst würde eine einzeilige
 * Funktion wie `function bar(): string { return t("…"); }` fälschlich als Modul-Ebene gemeldet
 * (die `{` links vom Aufruf muss vor dem Check verarbeitet sein).
 */
function moduleLevelTCalls(src: string): { line: number; text: string }[] {
  const offenders: { line: number; text: string }[] = [];
  const stack: ("fn" | "class" | "other")[] = [];
  let inBlock = false;
  src.split("\n").forEach((rawLine, i) => {
    const stripped = stripBlockComments(rawLine, inBlock);
    inBlock = stripped.inBlock;
    const codeOnly = stripLineComment(stripStringContents(stripped.code));
    for (let ci = 0; ci < codeOnly.length; ci++) {
      const ch = codeOnly[ci];
      if (ch === "{") {
        stack.push(braceKind(codeOnly.slice(0, ci)));
      } else if (ch === "}") {
        stack.pop();
      } else if (ch === "t" && /^t\(\s*["'`]/.test(codeOnly.slice(ci))) {
        const prevChar = ci === 0 ? "" : codeOnly[ci - 1];
        const wordBoundary = !/[A-Za-z0-9_$]/.test(prevChar);
        // Ausdrucks-Arrow ohne eigenen Block (`x = () => t("k")`) öffnet keine `{` und taucht
        // deshalb nie im Stack auf — der Rumpf läuft trotzdem erst beim Aufruf. Ohne diesen
        // Zweig meldete der Wächter `const f = (): string => t("k")` fälschlich, und ein
        // Arrow-Klassenfeld wäre nach der class-Verschärfung neu falsch geworden.
        // VERANKERT, genau wie `braceKind` es fuer Block-Arrows tut: der Pfeil muss unmittelbar
        // vor dem Aufruf stehen. Eine blosse Suche in der Zeile gaebe einem eifrigen Aufruf einen
        // Freibrief, sobald irgendwo davor ein FREMDER Pfeil steht —
        // `const H = { onClick: () => run(), title: t("k") }` ist genau der Fall, den der
        // Waechter fangen soll.
        const deferredByArrow = /=>\s*$/.test(codeOnly.slice(0, ci));
        if (wordBoundary && !stack.includes("fn") && !deferredByArrow) {
          offenders.push({ line: i + 1, text: rawLine.trim() });
        }
      }
    }
  });
  return offenders;
}

describe("moduleLevelTCalls (Waechter-Selbsttest)", () => {
  const offends = (src: string): boolean => moduleLevelTCalls(src).length > 0;

  it("meldet t() in einer Top-Level-Konstante", () => {
    expect(offends('const X = t("a.b");')).toBe(true);
  });
  it("meldet t() in einem mehrzeiligen Top-Level-Objektliteral", () => {
    expect(offends('const M = {\n  a: t("a.b"),\n};')).toBe(true);
  });
  it("meldet t() NICHT im Funktionsrumpf", () => {
    expect(offends('function f(): string {\n  return t("a.b");\n}')).toBe(false);
  });
  it("meldet t() NICHT im Getter einer Klasse — das korrekte verzoegerte Idiom", () => {
    expect(offends('class A {\n  get label(): string { return t("a.b"); }\n}')).toBe(false);
  });
  it("meldet ein blankes Klassenfeld mit t() — es wird bei der Instanziierung ausgewertet", () => {
    expect(offends('class A {\n  label = t("a.b");\n}')).toBe(true);
  });
  it("meldet ein Klassenfeld mit t() auch hinter Modifikatoren", () => {
    expect(offends('class A {\n  private readonly label = t("a.b");\n}')).toBe(true);
  });
  it("meldet ein Arrow-Klassenfeld NICHT — der Rumpf laeuft erst beim Aufruf", () => {
    expect(offends('class A {\n  getLabel = (): string => t("a.b");\n}')).toBe(false);
  });
  it("meldet t() NICHT im Rumpf einer Methode mit geschweiften Klammern im Rueckgabetyp", () => {
    // `Promise<{ a: string }>` bringt zwei Klammern in den Signaturkopf; wird der Body-Oeffner
    // deswegen als Objektliteral klassifiziert, gilt der ganze Methodenrumpf als Modul-Ebene.
    expect(offends('class A {\n  async send(): Promise<{ a: string }> {\n    return { a: t("a.b") };\n  }\n}')).toBe(false);
  });
  it("meldet t() NICHT in einer freien Funktion mit Objektliteral-Rueckgabetyp", () => {
    expect(offends('function f(): { a: string } {\n  return { a: t("a.b") };\n}')).toBe(false);
  });
  it("meldet ein eifriges t() auch dann, wenn frueher in der Zeile ein fremder Pfeil steht", () => {
    // Der Pfeil gehoert zu `onClick`, nicht zu `title` — `title` wird beim Modul-Load ausgewertet.
    // Eine ungeankerte Pfeil-Suche gaebe hier einen Freibrief fuer genau den Fall, den der
    // Waechter fangen soll.
    expect(offends('const H = { onClick: () => run(), title: t("a.b") };')).toBe(true);
  });
  it("meldet eine Top-Level-Arrow-Konstante NICHT", () => {
    expect(offends('const f = (): string => t("a.b");')).toBe(false);
  });
  it("meldet t() NICHT in einem einzeiligen Block-Kommentar", () => {
    expect(offends('/* @example t("a.b") */')).toBe(false);
  });
  it("meldet t() NICHT in einem mehrzeiligen Doc-Kommentar", () => {
    // Genau die Form aus src/vendor/kit/i18n.ts — mit Anfuehrungszeichen IM Kommentar.
    expect(offends('/**\n * @example t("a.b", 3) // "Bild 3"\n */\nexport function t() {}')).toBe(false);
  });
  it("meldet ein eifriges t() nach dem Ende eines Block-Kommentars weiterhin", () => {
    // Die Gegenprobe zum vorigen Punkt: der Stripper darf nicht die halbe Datei verschlucken.
    expect(offends('/* nur ein Hinweis */\nconst X = t("a.b");')).toBe(true);
  });
  it("meldet ein eifriges t() in derselben Zeile hinter einem Block-Kommentar", () => {
    expect(offends('const X = /* wichtig */ t("a.b");')).toBe(true);
  });
});

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
    const offenders = walk("src").flatMap((f) =>
      moduleLevelTCalls(readFileSync(f, "utf8")).map((o) => `${f}:${o.line} → ${o.text}`),
    );
    expect(offenders).toEqual([]);
  });
});
