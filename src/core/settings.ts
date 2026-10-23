import { isInFolder } from "../vendor/kit/folder-scope";

export interface LabSettings {
  enabled: boolean;
  keepDays: number;
  maxBytes: number;
  /** Feature-Kennungen, die nie mitgeschrieben werden (z.B. der Endpunkt-Testknopf). */
  excludedFeatures: string[];
  /** Zusaetzliche Zeichenketten, die als PII behandelt werden. */
  customPiiTerms: string[];
  /** Strengere Politik: schon den rohen Trace PII-redigieren. Standard aus —
   *  das Debugging braucht, was wirklich gesendet wurde. */
  redactPiiInTrace: boolean;
  /** Vault-Ordner, deren Notizen nie protokolliert werden. Vergleich nach der Lesart des strengsten
   *  Dateisystems mit Ordnergrenze — greift nur bei Aufrufen, deren Plugin `contextPaths` mitliefert. */
  excludedFolders: string[];
  /** true: ein einziger ausgeschlossener Pfad verhindert den Record (Default).
   *  false: nur wenn ALLE beteiligten Notizen ausgeschlossen sind. */
  strictFolderExclusion: boolean;
}

export const DEFAULT_SETTINGS: LabSettings = {
  enabled: true,
  keepDays: 7,
  maxBytes: 20 * 1024 * 1024,
  excludedFeatures: ["settings-probe"],
  customPiiTerms: [],
  redactPiiInTrace: false,
  excludedFolders: [],
  strictFolderExclusion: true,
};

/** Entscheidet, ob die beteiligten Notizen einen Record verhindern.
 *
 *  **fail-open, wenn keine Pfade kommen.** Fail-closed hiesse: sobald ein Ordner
 *  ausgeschlossen ist, verstummt jeder Konsument, der noch keine Pfade liefert.
 *  Der Preis ist eine Zusage mit Grenze — die steht deshalb im Settings-Tab. */
export function pathsExcluded(paths: string[] | undefined, s: LabSettings): boolean {
  // Die Ordner-Einstellung wird HIER getrimmt (das Kit trimmt nicht: sonst schlösse „Privat “ still nichts mehr aus), leere Zeilen fliegen raus,
  // BEVOR verglichen wird: ein leerer String wäre als Präfix auf jedem Pfad wahr und machte aus einem Tippfehler ein stummes Plugin.
  const folders = s.excludedFolders.map((f) => f.trim()).filter((f) => f.length > 0);
  if (folders.length === 0) return false;
  if (!paths || paths.length === 0) return false;

  // Datenschutzgrenze: ein ausgeschlossener Ordner BEWACHT, also die Lesart des strengsten Dateisystems (Kit `folder-scope`): Leerraum und Punkt am
  // Segmentende, `:`-Suffix und Groß-/Kleinschreibung ändern nicht, welcher Ordner gemeint ist. `self`: der Ordner selbst zählt als ausgeschlossen.
  const trifft = (p: string): boolean => folders.some((f) => isInFolder(p, f, { self: true, reading: "filesystem" }));
  return s.strictFolderExclusion ? paths.some(trifft) : paths.every(trifft);
}

/** Was fuer die Ja/Nein-Entscheidung gebraucht wird — bewusst nicht der ganze
 *  `LabLogInput`: die Entscheidung gehoert in den obsidian-freien Kern. */
export interface LogDecisionInput {
  feature: string;
  contextPaths?: string[];
}

/** `paused` ist Sitzungszustand, keine Einstellung: die Pause soll beim naechsten Start
 *  von selbst enden, damit niemand wochenlang stumm mitlaeuft, ohne es zu merken.
 *
 *  Beide Ausschlussarten stehen bewusst in EINER Funktion. Zwei getrennte, die jeder
 *  Aufrufer selbst kombinieren muss, sind die Fehlerklasse, bei der eine Schicht
 *  spaeter vergessen wird. Auswertung kurzschliessend in dieser Reihenfolge:
 *  enabled → paused → feature → Pfade. */
export function shouldLog(input: LogDecisionInput, paused: boolean, s: LabSettings): boolean {
  if (!s.enabled || paused) return false;
  if (s.excludedFeatures.includes(input.feature)) return false;
  return !pathsExcluded(input.contextPaths, s);
}
