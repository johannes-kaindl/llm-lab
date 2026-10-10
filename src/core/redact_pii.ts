/** PII-Redaktion fuer TraceRecords: dünner Mantel um den Kit-Redaktor.
 *
 *  Die Muster, die Reihenfolge (EMAIL, IBAN, PHONE, URLCRED, dann eigene Begriffe), die
 *  record-weit konsistente Nummerierung (`[EMAIL_1]`) und die Zusage "dieselbe Adresse = derselbe
 *  Platzhalter in Prompt, Antwort und Korrekturtext" liegen in code-kit `redact`
 *  (`createPiiRedactor`; urspruenglich diese Datei). Hier bleibt, was einen plugin-eigenen Typ
 *  traegt: welche Felder eines TraceRecord Text sind.
 *
 *  Laeuft NUR ueber die text-tragenden Felder (messages[].content, response.content,
 *  response.reasoning, error) — nie ueber den gesamten serialisierten Record. Metadaten wie `ts`,
 *  `latencyMs`, `model` oder `endpointHost` sind Zifferngruppen bzw. Bezeichner, die das
 *  PHONE-Muster faelschlich traefe und dabei den Record unbemerkt beschaedigen wuerde. */

import { createPiiRedactor as createKitPiiRedactor } from "../vendor/kit/redact";
import type { TraceRecord } from "./types";

export interface PiiRedactor {
  /** Redigiert die Textfelder eines Records. */
  record(r: TraceRecord): TraceRecord;
  /** Redigiert einen einzelnen Text mit DEMSELBEN Zaehler — fuer Felder, die nicht
   *  Teil des Records sind (Korrekturtext, Notiz einer Bewertung). */
  text(s: string): string;
}

/** Ein Redaktor mit EINEM Platzhalter-Zaehler ueber alles, was durch ihn laeuft. */
export function createPiiRedactor(extra: string[]): PiiRedactor {
  const kit = createKitPiiRedactor({ extra });
  const redact = (t: string): string => kit.text(t);
  return {
    text: redact,
    record: (record) => ({
      ...record,
      messages: record.messages.map((m) => ({ ...m, content: redact(m.content) })),
      response: {
        ...record.response,
        content: redact(record.response.content),
        ...(record.response.reasoning !== undefined
          ? { reasoning: redact(record.response.reasoning) }
          : {}),
      },
      ...(record.error !== undefined ? { error: redact(record.error) } : {}),
    }),
  };
}

/** Unveraenderte Fassade — `TraceStore.writeNow` und alle bestehenden Tests haengen daran. */
export function redactPii(record: TraceRecord, extra: string[]): TraceRecord {
  return createPiiRedactor(extra).record(record);
}
