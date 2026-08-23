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
  /** Vault-Ordner, deren Notizen nie protokolliert werden. Praefix-Vergleich mit
   *  Ordnergrenze — greift nur bei Aufrufen, deren Plugin `contextPaths` mitliefert. */
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

/** Vault-Pfade kommen aus fremden Plugins und damit in fremder Schreibweise.
 *  Trimmen zuerst, sonst laeuft die Slash-Entfernung hinter einem Leerzeichen ins Leere. */
function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Entscheidet, ob die beteiligten Notizen einen Record verhindern.
 *
 *  **fail-open, wenn keine Pfade kommen.** Fail-closed hiesse: sobald ein Ordner
 *  ausgeschlossen ist, verstummt jeder Konsument, der noch keine Pfade liefert.
 *  Der Preis ist eine Zusage mit Grenze — die steht deshalb im Settings-Tab. */
export function pathsExcluded(paths: string[] | undefined, s: LabSettings): boolean {
  // Leere Zeilen fliegen raus, BEVOR verglichen wird: ein leerer String waere als
  // Praefix auf jedem Pfad wahr und machte aus einem Tippfehler ein stummes Plugin.
  const folders = s.excludedFolders.map(normalizePath).filter((f) => f.length > 0);
  if (folders.length === 0) return false;
  if (!paths || paths.length === 0) return false;

  const trifft = (p: string): boolean => {
    const path = normalizePath(p);
    // Ordnergrenze: sonst schluckt der Ausschluss „Privat" auch „Privates.md".
    return folders.some((f) => path === f || path.startsWith(f + "/"));
  };
  return s.strictFolderExclusion ? paths.some(trifft) : paths.every(trifft);
}

/** `paused` ist Sitzungszustand, keine Einstellung: die Pause soll beim naechsten Start
 *  von selbst enden, damit niemand wochenlang stumm mitlaeuft, ohne es zu merken. */
export function shouldLog(feature: string, paused: boolean, s: LabSettings): boolean {
  if (!s.enabled || paused) return false;
  return !s.excludedFeatures.includes(feature);
}
