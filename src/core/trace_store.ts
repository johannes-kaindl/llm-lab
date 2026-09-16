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

  /** Alle Vorgaenge, die die Trace-Schicht veraendern, haengen an EINER Promise-Kette.
   *  Ohne sie ueberschreibt das zeilenweise Entfernen einen gleichzeitigen `append`
   *  — stiller Datenverlust, der schlimmste Fehler in einem Logging-System. */
  private tail: Promise<void> = Promise.resolve();

  /** Fehler brechen die Kette NICHT ab: ein gescheiterter Schreibvorgang darf den
   *  naechsten nicht mitreissen. Deshalb steht `job` in beiden Zweigen von `then`. */
  private serialize(job: () => Promise<void>): Promise<void> {
    this.tail = this.tail.then(job, job);
    return this.tail;
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
    return this.serialize(async () => {
      try {
        const afterSecrets = redactRecordSecrets(record, opts?.secrets ?? []);
        const safe = opts?.redactPii ? redactPii(afterSecrets, opts.piiTerms ?? []) : afterSecrets;
        await this.sink.append(`${this.dir()}/${this.today()}.jsonl`, JSON.stringify(safe) + "\n");
        await this.rotateNow();
      } catch (e) {
        console.warn("LLM Lab: Trace konnte nicht geschrieben werden", e);
      }
    });
  }

  /** Oeffentlich, damit ein Aufrufer (main.ts:onload) eine Rotation ausloesen kann, ohne
   *  zugleich etwas zu schreiben — sonst raeumt ein pausiertes oder ungenutztes Plugin
   *  nie etwas weg, egal wie kurz `keepDays` gesetzt ist. Fehler werden geschluckt, mit
   *  derselben Zusage wie bei `writeNow`: eine gescheiterte Rotation darf einen Aufrufer
   *  nie zu Fall bringen. */
  async rotate(): Promise<void> {
    return this.serialize(() => this.rotateNow());
  }

  /** Die eigentliche Arbeit — NUR aufrufen, wenn man bereits in der Kette laeuft. */
  private async rotateNow(): Promise<void> {
    try {
      const files = await this.sink.list(this.dir());
      for (const name of planRotation(files, this.limits(), this.today())) {
        await this.sink.remove(`${this.dir()}/${name}`);
      }
    } catch (e) {
      console.warn("LLM Lab: Rotation fehlgeschlagen", e);
    }
  }

  /** Entfernt genau eine Zeile aus der Tagesdatei. Laeuft ueber dieselbe Kette wie
   *  `append` — sonst geht ein gleichzeitiger Konsumenten-Aufruf verloren. */
  async removeRecord(day: string, id: string): Promise<void> {
    return this.serialize(async () => {
      try {
        const pfad = `${this.dir()}/${day}.jsonl`;
        const roh = await this.sink.read(pfad);
        if (roh === "") return;
        const behalten = roh
          .split("\n")
          .filter((zeile) => {
            if (zeile.trim() === "") return false;
            try {
              return (JSON.parse(zeile) as { id?: string }).id !== id;
            } catch {
              // Unparsbare Zeile stehen lassen: sie ist nicht der gesuchte Record,
              // und stilles Wegwerfen waere genau der Datenverlust, den diese Kette
              // verhindern soll.
              return true;
            }
          });
        await this.sink.write(pfad, behalten.length > 0 ? behalten.join("\n") + "\n" : "");
      } catch (e) {
        console.warn("LLM Lab: Record konnte nicht entfernt werden", e);
      }
    });
  }
}
