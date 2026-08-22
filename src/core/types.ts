export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TraceRecord {
  id: string;
  ts: string;
  /** manifest-id des aufrufenden Plugins, z.B. "vault-retrieval". */
  plugin: string;
  /** Trennschaerfe der Auswertung: "chat" | "reformat:table-to-list" | "smart-apply" | ... */
  feature: string;
  model: string;
  /** NUR Host und Port. Pfad und Query koennen Schluessel tragen. */
  endpointHost: string;
  /** Fehlt, wenn der Aufruf keine System-Nachricht hatte. */
  systemPromptHash?: string;
  messages: ChatMessage[];
  response: { content: string; reasoning?: string };
  finishReason?: string;
  latencyMs: number;
  /** Zeit bis zum ersten Token — erklaert "gefuehlt langsam" getrennt von der Gesamtdauer. */
  ttftMs?: number;
  error?: string;
}
