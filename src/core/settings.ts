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
}

export const DEFAULT_SETTINGS: LabSettings = {
  enabled: true,
  keepDays: 7,
  maxBytes: 20 * 1024 * 1024,
  excludedFeatures: ["settings-probe"],
  customPiiTerms: [],
  redactPiiInTrace: false,
};

/** `paused` ist Sitzungszustand, keine Einstellung: die Pause soll beim naechsten Start
 *  von selbst enden, damit niemand wochenlang stumm mitlaeuft, ohne es zu merken. */
export function shouldLog(feature: string, paused: boolean, s: LabSettings): boolean {
  if (!s.enabled || paused) return false;
  return !s.excludedFeatures.includes(feature);
}
