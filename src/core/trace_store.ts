import type { TraceRecord } from "./types";
import { redactRecordSecrets } from "./redact_secrets";
import { redactPii } from "./redact_pii";
import { planRotation, type RotationLimits, type TraceFile } from "./rotation";

/** Minimaler Datei-Port. Obsidians `vault.adapter` erfuellt ihn mit duenner Anpassung.
 *  Injiziert, damit der Store ohne Plattform-Laufzeit testbar ist. */
export interface TraceSink {
  append(path: string, data: string): Promise<void>;
  list(dir: string): Promise<TraceFile[]>;
  remove(path: string): Promise<void>;
}

export interface WriteOptions {
  /** Endpunkt-Schluessel, die maskiert werden. Laeuft IMMER, auf jeder Schicht. */
  secrets?: string[];
  /** Zusaetzlich die PII-Redaktion ueber die Textfelder laufen lassen (strengere Politik). */
  redactPii?: boolean;
  /** Zusaetzliche Begriffe fuer die PII-Redaktion. Nur wirksam mit redactPii. */
  piiTerms?: string[];
}

/** Append-only JSONL-Log, eine Zeile je Aufruf.
 *
 *  Fehler werden geschluckt: der Aufruf, den wir protokollieren, ist stromaufwaerts
 *  bereits gelaufen — Telemetrie darf ihn nie nachtraeglich zu Fall bringen. */
export class TraceStore {
  constructor(
    private readonly sink: TraceSink,
    private readonly baseDir: string,
    private readonly limits: RotationLimits,
    private readonly today: () => string,
  ) {}

  private dir(): string {
    return `${this.baseDir}/traces`;
  }

  /** Fire-and-forget. Der Rueckgabetyp ist `void`, nicht `Promise<void>` — ein Aufrufer
   *  soll gar nicht erst in Versuchung kommen, darauf zu warten. */
  write(record: TraceRecord, opts?: WriteOptions): void {
    void this.writeNow(record, opts);
  }

  /** Dieselbe Arbeit, awaitbar — ausschliesslich fuer Tests.
   *
   *  Redaktionsreihenfolge: erst PII (nur Textfelder, strengere Politik, optional), dann
   *  Schluessel-Maskierung ueber den gesamten Record (laeuft immer). Die Schluessel-Zusage
   *  ist die haertere und bekommt deshalb das letzte Wort. */
  async writeNow(record: TraceRecord, opts?: WriteOptions): Promise<void> {
    try {
      const afterPii = opts?.redactPii ? redactPii(record, opts.piiTerms ?? []) : record;
      const safe = redactRecordSecrets(afterPii, opts?.secrets ?? []);
      await this.sink.append(`${this.dir()}/${this.today()}.jsonl`, JSON.stringify(safe) + "\n");
      await this.rotate();
    } catch (e) {
      console.warn("LLM Lab: Trace konnte nicht geschrieben werden", e);
    }
  }

  private async rotate(): Promise<void> {
    const files = await this.sink.list(this.dir());
    for (const name of planRotation(files, this.limits, this.today())) {
      await this.sink.remove(`${this.dir()}/${name}`);
    }
  }
}
