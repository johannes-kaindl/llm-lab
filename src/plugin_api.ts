import { buildTraceRecord, type TraceInput } from "./core/record";
import { shouldLog, type LabSettings } from "./core/settings";
import type { TraceStore } from "./core/trace_store";

/** Version des oeffentlichen Vertrags. Wird bei jeder brechenden Aenderung erhoeht;
 *  Konsumenten pruefen sie, bevor sie sich auf die Form verlassen.
 *  2 (2026-08-23): `secrets` und `contextPaths` auf LabLogInput.
 *  3 (2026-08-30): `promptTemplate` auf LabLogInput; `systemPromptHash` im Record
 *  entfaellt zugunsten von `promptTemplateHash`. */
export const LLM_LAB_API_VERSION = 3;

export interface LabStatus {
  apiVersion: number;
  /** Wird gerade mitgeschrieben? Synchron und netzfrei. */
  recording: boolean;
}

/** Was ein Konsument uebergibt. `id` und `ts` vergibt das Lab. */
export type LabLogInput = Omit<TraceInput, "id" | "ts"> & {
  /** Endpunkt-Schluessel des Aufrufers. NUR Maskierungsliste — wandert nie in den
   *  Record. Optional: ein Konsument ohne Auth soll kein Dummy-Feld fuellen. */
  secrets?: string[];
  /** Vault-Pfade der Notizen, deren Inhalt in diesen Aufruf eingeflossen ist.
   *  Grundlage des Ordner-Filters; fehlt das Feld, greift der Filter nicht. */
  contextPaths?: string[];
};

/** Vertrag, den llm-lab anderen Obsidian-Plugins als `plugin.api` anbietet.
 *  Zugriff: `app.plugins.plugins["llm-lab"]?.api` (defensiv lesen). */
export interface LlmLabApi {
  readonly apiVersion: number;
  status(): LabStatus;
  /** Gibt die vergebene Record-id SYNCHRON zurueck und schreibt intern asynchron.
   *  Ein `Promise<string>` zwaenge jeden Konsumenten, der die id fuer einen spaeteren
   *  Bewertungsknopf braucht, zu einem `await` mitten im Antwortpfad — genau die
   *  Kopplung, die "Telemetrie bremst nie" ausschliessen soll. */
  log(input: LabLogInput): string;
}

export interface ApiDeps {
  store: () => TraceStore;
  settings: () => LabSettings;
  paused: () => boolean;
  secrets: () => string[];
  now: () => string;
  newId: () => string;
}

export function createLlmLabApi(deps: ApiDeps): LlmLabApi {
  return {
    apiVersion: LLM_LAB_API_VERSION,

    status(): LabStatus {
      return {
        apiVersion: LLM_LAB_API_VERSION,
        recording: deps.settings().enabled && !deps.paused(),
      };
    },

    log(input: LabLogInput): string {
      // Die Zusage ist "log() wirft nie" — ein Konsument ruft synchron mitten in seinem
      // eigenen Streaming-Pfad auf und darf dabei nie reissen, auch nicht bei einem
      // fehlerhaften Input (`buildTraceRecord` liest z.B. `input.messages.find(...)`
      // unbewacht). Die Garantie gehoert der Seite, die sie verspricht, nicht jedem
      // Aufrufer einzeln.
      const id = deps.newId();
      try {
        // Fail-closed vor der Store-Grenze: ein Konsument kommt ohne Typpruefung durch die
        // Plugin-Grenze, und ein Record mit kaputtem `messages` waere nicht nur Datenmuell —
        // `redactPii` arbeitet feldweise ueber `messages[]` und liefe an einem Nicht-Array
        // ins Leere, statt zu schwaerzen. Bis 2026-08-30 ergab sich dieselbe Wirkung
        // zufaellig daraus, dass `buildTraceRecord` `messages.find(...)` unbewacht las; seit
        // der Hash ueber `promptTemplate` laeuft, tut es das nicht mehr. Jetzt steht es da,
        // wo die Zusage lebt.
        if (!Array.isArray(input.messages)) {
          throw new TypeError("LLM Lab: log() erwartet messages als Array");
        }
        if (!shouldLog(input, deps.paused(), deps.settings())) return id;
        const settings = deps.settings();
        // `secrets` und `contextPaths` sind Steuerdaten DIESES Aufrufs, kein
        // Record-Inhalt — explizit heraustrennen, statt darauf zu vertrauen, dass
        // buildTraceRecord sie ohnehin ignoriert, weil es Feld fuer Feld baut. Ein
        // spaeteres `...input`-Spread im Builder waere sonst ein stiller Leak.
        // (`contextPaths` ist ein Rest-Sibling und deshalb fuer no-unused-vars kein Befund.)
        const { secrets: aufrufSchluessel, contextPaths, ...traceInput } = input;
        deps.store().write(buildTraceRecord({ ...traceInput, id, ts: deps.now() }), {
          // Vereinigen, nicht ersetzen: `deps.secrets()` ist die Stelle, an der spaeter
          // eine im Lab konfigurierte Schluesselliste andockt.
          secrets: [...deps.secrets(), ...(aufrufSchluessel ?? [])],
          redactPii: settings.redactPiiInTrace,
          piiTerms: settings.customPiiTerms,
        });
      } catch (e) {
        console.warn("LLM Lab: log() mit fehlerhaftem Input, nichts geschrieben", e);
      }
      return id;
    },
  };
}
