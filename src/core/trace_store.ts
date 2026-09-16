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
  /** Leerer String, wenn es die Datei nicht gibt — der erste Start ist kein Fehlerfall
   *  (dieselbe Zusage wie `list`, das dort eine leere Liste liefert). */
  read(path: string): Promise<string>;
  /** Ersetzt den Inhalt vollstaendig. Nur fuer das Entfernen einzelner Zeilen —
   *  regulaeres Schreiben laeuft ueber `append`. */
  write(path: string, data: string): Promise<void>;
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
    /** Getter statt Wert: eine Aenderung an keepDays/maxBytes in den Einstellungen soll den
     *  naechsten Rotationslauf treffen, nicht erst einen Neustart. Passt zum Muster der
     *  anderen injizierten Abhaengigkeiten (`today` ist ebenfalls ein Getter). */
    private readonly limits: () => RotationLimits,
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
   *  Redaktionsreihenfolge: erst Schluessel-Maskierung (exakter String-Vergleich,
   *  laeuft immer), dann PII-Redaktion (Muster-Ersetzung ueber Textfelder, optional).
   *  Nicht "die haertere Zusage zuerst" — sondern: **wer exakt matcht, muss vor wem
   *  laeuft, der Muster umschreibt.** `redactPii`s PHONE-Muster ist ein blanker
   *  Ziffernlauf und trifft dabei auch auf die Ziffernfolge INNERHALB eines API-Schluessels;
   *  laeuft PII zuerst, zerreisst es den Schluessel in Fragmente, und die anschliessende
   *  exakte Suche von `redactRecordSecrets` findet das Original-Literal nicht mehr — die
   *  Fragmente landen ungeschwaerzt auf der Platte. Umgekehrt ist unbedenklich: eine
   *  Muster-Ersetzung zerreisst nichts, was noch geschwaerzt werden muesste, denn nichts,
   *  was die Schluessel-Maskierung erzeugt (`••••`, `Bearer ••••`), matcht EMAIL/IBAN/
   *  PHONE/URLCRED. */
  async writeNow(record: TraceRecord, opts?: WriteOptions): Promise<void> {
    try {
      const afterSecrets = redactRecordSecrets(record, opts?.secrets ?? []);
      const safe = opts?.redactPii ? redactPii(afterSecrets, opts.piiTerms ?? []) : afterSecrets;
      await this.sink.append(`${this.dir()}/${this.today()}.jsonl`, JSON.stringify(safe) + "\n");
      await this.rotate();
    } catch (e) {
      console.warn("LLM Lab: Trace konnte nicht geschrieben werden", e);
    }
  }

  /** Oeffentlich, damit ein Aufrufer (main.ts:onload) eine Rotation ausloesen kann, ohne
   *  zugleich etwas zu schreiben — sonst raeumt ein pausiertes oder ungenutztes Plugin
   *  nie etwas weg, egal wie kurz `keepDays` gesetzt ist. Fehler werden geschluckt, mit
   *  derselben Zusage wie bei `writeNow`: eine gescheiterte Rotation darf einen Aufrufer
   *  nie zu Fall bringen. */
  async rotate(): Promise<void> {
    try {
      const files = await this.sink.list(this.dir());
      for (const name of planRotation(files, this.limits(), this.today())) {
        await this.sink.remove(`${this.dir()}/${name}`);
      }
    } catch (e) {
      console.warn("LLM Lab: Rotation fehlgeschlagen", e);
    }
  }
}
