export interface TraceFile {
  name: string;
  bytes: number;
}

export interface RotationLimits {
  keepDays: number;
  maxBytes: number;
}

const DATED = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Pure Entscheidung, welche Trace-Dateien weg muessen. `today` kommt als Parameter
 *  herein statt aus `Date`, damit die Regel ohne Zeitreise pruefbar ist.
 *
 *  Die heutige Datei wird nie geloescht: sie ist die, in die gerade geschrieben wird —
 *  sie unter der Groessengrenze wegzuraeumen hiesse, den laufenden Betrieb zu leeren. */
export function planRotation(
  files: TraceFile[],
  limits: RotationLimits,
  today: string,
): string[] {
  const dated = files
    .map((f) => ({ f, m: DATED.exec(f.name) }))
    .filter((x): x is { f: TraceFile; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ ...x.f, day: x.m[1] }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const doomed = new Set<string>();
  for (const f of dated) {
    if (f.day !== today && daysBetween(f.day, today) > limits.keepDays) doomed.add(f.name);
  }

  let total = dated.filter((f) => !doomed.has(f.name)).reduce((s, f) => s + f.bytes, 0);
  for (const f of dated) {
    if (total <= limits.maxBytes) break;
    if (doomed.has(f.name) || f.day === today) continue;
    doomed.add(f.name);
    total -= f.bytes;
  }

  return dated.filter((f) => doomed.has(f.name)).map((f) => f.name);
}
