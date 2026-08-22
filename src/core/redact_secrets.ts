// uebernommen aus vault-crews/src/core/redact.ts, 2026-08-22
/** Maskiert API-Schluessel in Text, der die Prozessgrenze verlaesst.
 *
 *  Gegenueber der Vorlage geaendert: nimmt eine Schluesselliste statt EndpointConfig[] —
 *  llm-lab kennt die Endpunkt-Typen der Konsumenten nicht und soll sie nicht kennen. */

const MASK = "••••";
/** Kuerzer als das maskiert der Schluessel als Teilstring gewoehnliche Woerter und macht
 *  die Meldung unlesbar — ein echter Token ist immer laenger. */
const MIN_KEY_LENGTH = 8;
/** Faengt auch Schluessel, die nirgends konfiguriert sind (durchgereichte Header-Echos). */
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactSecrets(text: string, keys: string[]): string {
  if (text === "") return text;
  let out = text;
  for (const raw of keys) {
    const key = raw.trim();
    if (!key || key.length < MIN_KEY_LENGTH) continue;
    out = out.replace(new RegExp(escapeRegExp(key), "g"), MASK);
  }
  return out.replace(BEARER, `$1${MASK}`);
}

/** Redigiert ein ganzes Objekt ueber die Serialisierung statt Feld fuer Feld —
 *  eine Liste zu pflegender Felder waere genau die Buchhaltung, die beim naechsten
 *  neuen Feld still veraltet. */
export function redactRecordSecrets<T>(value: T, keys: string[]): T {
  return JSON.parse(redactSecrets(JSON.stringify(value), keys)) as T;
}
