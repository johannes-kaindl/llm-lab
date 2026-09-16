import type { TraceSink } from "./trace_store";
import type { TraceRecord } from "./types";
import { parseJsonl } from "./dataset";

/** Feste Zahl, bewusst keine Einstellung: eine Zahl, die man erklaeren muesste, ist
 *  teurer als eine, die reicht. Bei 20 MB Trace-Grenze und ~2 KB je Record liegen bis
 *  zu ~10.000 Records vor — die zu parsen ist ertraeglich, 10.000 DOM-Zeilen nicht. */
export const LISTEN_GRENZE = 200;

export interface TraceFilter {
  plugin?: string;
  feature?: string;
  model?: string;
  nurUnbewertete?: boolean;
  /** Fehler-Records sind NICHT bewertbar (sie wurden nie beantwortet) und deshalb aus
   *  jedem anderen Filter ausgeschlossen — sonst staenden sie unter "nur unbewertete"
   *  bei jedem Durchgang wieder da. Dieser Filter macht sie fuer die Fehlersuche
   *  sichtbar; verstecken waere falsch, denn der interessante Debug-Fall ist der
   *  gescheiterte. */
  nurFehler?: boolean;
}

/** Pur: Filter + Sortierung + Grenze. Ohne Sink testbar. */
export function applyFilter(
  rows: TraceRecord[],
  filter: TraceFilter,
  ratedIds: Set<string>,
): TraceRecord[] {
  const out = rows.filter((r) => {
    const hatFehler = r.error !== undefined;
    if (filter.nurFehler) return hatFehler;
    if (hatFehler) return false;
    if (filter.plugin && r.plugin !== filter.plugin) return false;
    if (filter.feature && r.feature !== filter.feature) return false;
    if (filter.model && r.model !== filter.model) return false;
    if (filter.nurUnbewertete && ratedIds.has(r.id)) return false;
    return true;
  });
  out.sort((a, b) => {
    const tsCmp = a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0;
    if (tsCmp !== 0) return tsCmp;
    // Tiebreaker bei gleichen Timestamps: nach id descending (neuere Eintraege zuerst)
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });
  return out.slice(0, LISTEN_GRENZE);
}

const DATED = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

export class TraceReader {
  constructor(
    private readonly sink: TraceSink,
    private readonly baseDir: string,
  ) {}

  private dir(): string {
    return `${this.baseDir}/traces`;
  }

  /** Alle Tagesdateien. Die Zahl kaputter Zeilen wird durchgereicht, nicht geschluckt —
   *  die Ansicht nennt sie in ihrer Fusszeile. */
  async all(): Promise<{ rows: TraceRecord[]; kaputt: number }> {
    const rows: TraceRecord[] = [];
    let kaputt = 0;
    for (const f of await this.sink.list(this.dir())) {
      if (!DATED.test(f.name)) continue;
      const teil = parseJsonl<TraceRecord>(await this.sink.read(`${this.dir()}/${f.name}`));
      rows.push(...teil.rows);
      kaputt += teil.kaputt;
    }
    return { rows, kaputt };
  }

  /** Der Tag, in dessen Datei ein Record steht — `removeRecord` braucht ihn. */
  static dayOf(record: TraceRecord): string {
    return record.ts.slice(0, 10);
  }
}
