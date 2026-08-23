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
    // Zwei Nadeln: die rohe Form (fuer direkte Aufrufe auf unserialisiertem Text) UND die
    // JSON-escapte Form (fuer den Aufruf ueber redactRecordSecrets — dort steht ein Schluessel
    // mit `"`, `\` oder Zeilenumbruch serialisiert anders da, und die rohe Suche faende ihn
    // nie). Nur zusaetzlich, nicht statt: keine der beiden ersetzt die andere.
    const escaped = JSON.stringify(key).slice(1, -1);
    const needles = escaped === key ? [key] : [key, escaped];
    for (const needle of needles) {
      out = out.replace(new RegExp(escapeRegExp(needle), "g"), MASK);
    }
  }
  return out.replace(BEARER, `$1${MASK}`);
}

/** Redigiert ein ganzes Objekt ueber die Serialisierung statt Feld fuer Feld —
 *  eine Liste zu pflegender Felder waere genau die Buchhaltung, die beim naechsten
 *  neuen Feld still veraltet.
 *
 *  **Wichtig:** Wirft auf nicht-serialisierbarem Input (zirkulaere Referenzen, etc.).
 *  Das ist absichtlich und fail-closed: wird nichts geschrieben, statt das Objekt
 *  ungeredigt zu persistieren. Der Aufrufer (TraceStore.writeNow) faengt den Fehler,
 *  sodass kein Geheimnis auf der Platte landet. */
export function redactRecordSecrets<T>(value: T, keys: string[]): T {
  return JSON.parse(redactSecrets(JSON.stringify(value), keys)) as T;
}
