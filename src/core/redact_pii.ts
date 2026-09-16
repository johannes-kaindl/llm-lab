/** PII-Redaktion mit nummerierten, record-weit konsistenten Platzhaltern.
 *
 *  Laeuft NUR ueber die text-tragenden Felder eines TraceRecord (messages[].content,
 *  response.content, response.reasoning, error) — nie ueber den gesamten
 *  serialisierten Record. Metadaten wie `ts`, `latencyMs`, `model` oder `endpointHost`
 *  sind Zifferngruppen bzw. Bezeichner, die von den Mustern (insbesondere PHONE)
 *  faelschlich getroffen wuerden und dabei den Record unbemerkt beschaedigen wuerden.
 *
 *  Der Platzhalter-Zaehler ist EINE Map ueber alle Felder hinweg: dieselbe Adresse muss
 *  im Prompt UND in der Antwort denselben Platzhalter bekommen, sonst lernt ein aus
 *  solchen Daten trainiertes Modell, aus einem Platzhalter konkrete Daten zu erfinden. */

import type { TraceRecord } from "./types";

interface Pattern {
  label: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { label: "EMAIL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { label: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Za-z0-9]{4}){2,7}(?:[ ]?[A-Za-z0-9]{1,4})?\b/g },
  { label: "PHONE", re: /(?:\+\d{1,3}[ /-]?)?(?:\(?\d{2,5}\)?[ /-]?)\d{3,}(?:[ -]?\d{2,})+/g },
  { label: "URLCRED", re: /\/\/[^\s:/@]+:[^\s:/@]+@/g },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ersetzt alle Treffer eines Musters durch nummerierte Platzhalter. `seen` wird vom
 *  Aufrufer uebergeben und ueber alle Felder eines Records hinweg geteilt — das ist
 *  die record-weite Konsistenz. */
function replaceAll(text: string, label: string, re: RegExp, seen: Map<string, string>): string {
  return text.replace(re, (hit) => {
    const known = seen.get(hit);
    if (known) return known;
    const token = `[${label}_${seen.size + 1}]`;
    seen.set(hit, token);
    return token;
  });
}

/** Redigiert einen einzelnen Text-Wert gegen alle Muster + Custom-Terme. Jedes Label
 *  bekommt seine eigene `seen`-Map (aus `mapsByLabel`), aber diese Map lebt ueber den
 *  ganzen Record — das macht `redactPii` durch, indem es dieselben Maps an jeden Aufruf
 *  von `redactText` weiterreicht. */
function redactText(
  text: string,
  customRe: RegExp | null,
  mapsByLabel: Map<string, Map<string, string>>,
): string {
  if (text === "") return text;
  let out = text;
  for (const p of PATTERNS) {
    const seen = mapsByLabel.get(p.label);
    if (!seen) continue;
    out = replaceAll(out, p.label, new RegExp(p.re.source, "g"), seen);
  }
  if (customRe) {
    const seen = mapsByLabel.get("CUSTOM");
    if (seen) out = replaceAll(out, "CUSTOM", customRe, seen);
  }
  return out;
}

export interface PiiRedactor {
  /** Redigiert die Textfelder eines Records. */
  record(r: TraceRecord): TraceRecord;
  /** Redigiert einen einzelnen Text mit DEMSELBEN Zaehler — fuer Felder, die nicht
   *  Teil des Records sind (Korrekturtext, Notiz einer Bewertung). */
  text(s: string): string;
}

/** Ein Redaktor mit EINEM Platzhalter-Zaehler ueber alles, was durch ihn laeuft.
 *  Genau das ist die Zusage: dieselbe Adresse bekommt in Prompt, Antwort UND
 *  Korrekturtext denselben Platzhalter. Zwei getrennte Laeufe koennten das nicht. */
export function createPiiRedactor(extra: string[]): PiiRedactor {
  const mapsByLabel = new Map<string, Map<string, string>>();
  for (const p of PATTERNS) mapsByLabel.set(p.label, new Map());

  const customs = extra.map((s) => s.trim()).filter(Boolean);
  let customRe: RegExp | null = null;
  if (customs.length > 0) {
    mapsByLabel.set("CUSTOM", new Map());
    customRe = new RegExp(customs.map(escapeRegExp).join("|"), "g");
  }

  const redact = (t: string): string => redactText(t, customRe, mapsByLabel);

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
