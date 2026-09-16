import type { TraceRecord } from "./types";
import type { PiiRedactor } from "./redact_pii";

export type Verdict = "up" | "down";

/** Was der Mensch beim Bewerten beisteuert. */
export interface RateInput {
  verdict: Verdict;
  tags: string[];
  note?: string;
  /** Die bessere Antwort, vom Menschen getippt. SFT-Material. */
  correction?: string;
}

/** Eine Zeile in dataset.jsonl: ein bewerteter, redigierter Trace.
 *
 *  Verschachtelt statt flach, weil ein Eintrag genau das IST. Der Export nimmt
 *  `entry.trace.messages` und muss kein zweites Feldset pflegen, das beim naechsten
 *  neuen TraceRecord-Feld still veraltet. */
export interface DatasetEntry {
  trace: TraceRecord;
  verdict: Verdict;
  tags: string[];
  note?: string;
  correction?: string;
  ratedAt: string;
}

/** Kopiert den Trace in die bleibende Schicht und redigiert ihn dabei.
 *
 *  Der Redaktor wird HEREINGEREICHT, nicht hier gebaut: Trace, Notiz und Korrektur
 *  muessen sich einen Platzhalter-Zaehler teilen (s. createPiiRedactor). Wer hier
 *  `createPiiRedactor` selbst aufriefe, bekaeme fuer jeden Aufruf einen neuen Zaehler. */
export function buildDatasetEntry(
  trace: TraceRecord,
  urteil: RateInput,
  redaktor: PiiRedactor,
  ratedAt: string,
): DatasetEntry {
  const note = urteil.note?.trim();
  const correction = urteil.correction?.trim();
  return {
    trace: redaktor.record(trace),
    verdict: urteil.verdict,
    tags: urteil.tags,
    ...(note ? { note: redaktor.text(note) } : {}),
    ...(correction ? { correction: redaktor.text(correction) } : {}),
    ratedAt,
  };
}

/** Zeilenweiser JSONL-Parser, der eine kaputte Zeile ueberspringt statt zu scheitern.
 *
 *  Ein Absturz waehrend `append` hinterlaesst eine abgeschnittene letzte Zeile. Die
 *  Anzahl wird ZURUECKGEGEBEN und nicht geschluckt: stilles Ueberspringen verbirgt
 *  Datenverlust, und die Ansicht nennt die Zahl in ihrer Fusszeile. */
export function parseJsonl<T>(roh: string): { rows: T[]; kaputt: number } {
  const rows: T[] = [];
  let kaputt = 0;
  for (const zeile of roh.split("\n")) {
    if (zeile.trim() === "") continue;
    try {
      rows.push(JSON.parse(zeile) as T);
    } catch {
      kaputt++;
    }
  }
  return { rows, kaputt };
}
