import { buildTraceRecord, type TraceInput } from "./core/record";
import { shouldLog, type LabSettings } from "./core/settings";
import type { TraceStore } from "./core/trace_store";

/** Version des oeffentlichen Vertrags. Wird bei jeder brechenden Aenderung erhoeht;
 *  Konsumenten pruefen sie, bevor sie sich auf die Form verlassen. */
export const LLM_LAB_API_VERSION = 1;

export interface LabStatus {
  apiVersion: number;
  /** Wird gerade mitgeschrieben? Synchron und netzfrei. */
  recording: boolean;
}

/** Was ein Konsument uebergibt. `id` und `ts` vergibt das Lab. */
export type LabLogInput = Omit<TraceInput, "id" | "ts">;

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
        if (!shouldLog(input.feature, deps.paused(), deps.settings())) return id;
        const settings = deps.settings();
        deps.store().write(buildTraceRecord({ ...input, id, ts: deps.now() }), {
          secrets: deps.secrets(),
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
