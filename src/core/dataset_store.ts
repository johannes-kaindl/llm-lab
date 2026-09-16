import type { TraceSink } from "./trace_store";
import { parseJsonl, type DatasetEntry } from "./dataset";

/** Die bleibende Schicht: nur Bewertetes, redigiert, ueberlebt die Rotation.
 *
 *  Liegt NEBEN traces/, nicht darin — `planRotation` sieht nur den traces-Ordner und
 *  kann den Datensatz damit strukturell nicht wegraeumen. */
export class DatasetStore {
  constructor(
    private readonly sink: TraceSink,
    private readonly baseDir: string,
  ) {}

  private path(): string {
    return `${this.baseDir}/dataset.jsonl`;
  }

  /** Append-only wie die Trace-Schicht. Eine Neubewertung haengt an; die
   *  Eindeutigkeit stellt `list()` her. */
  async add(entry: DatasetEntry): Promise<void> {
    await this.sink.append(this.path(), JSON.stringify(entry) + "\n");
  }

  /** Ein Eintrag je trace.id — der juengste gewinnt.
   *
   *  Verglichen wird `ratedAt`, nicht die Dateireihenfolge: eine spaeter geschriebene
   *  Zeile kann ein aelteres Urteil tragen (importierte oder nachgetragene Daten), und
   *  dann waere "letzte Zeile gewinnt" schlicht falsch. */
  async list(): Promise<DatasetEntry[]> {
    const { rows } = parseJsonl<DatasetEntry>(await this.sink.read(this.path()));
    const neueste = new Map<string, DatasetEntry>();
    for (const e of rows) {
      const id = e.trace?.id;
      if (typeof id !== "string") continue;
      const bisher = neueste.get(id);
      if (!bisher || e.ratedAt >= bisher.ratedAt) neueste.set(id, e);
    }
    return [...neueste.values()];
  }

  /** Welche Traces schon bewertet sind — Grundlage des Filters "nur unbewertete".
   *  Kein zweites Feld im Trace, kein Schreiben in die rohe Schicht. */
  async ratedIds(): Promise<Set<string>> {
    return new Set((await this.list()).map((e) => e.trace.id));
  }
}
