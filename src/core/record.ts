import type { ChatMessage, TraceRecord } from "./types";

export interface TraceInput {
  id: string;
  ts: string;
  plugin: string;
  feature: string;
  model: string;
  endpointUrl: string;
  messages: ChatMessage[];
  content: string;
  reasoning?: string;
  finishReason?: string;
  latencyMs: number;
  ttftMs?: number;
  error?: string;
}

/** FNV-1a, 32 bit. Kein kryptografischer Anspruch: der Hash soll zwei Prompt-Fassungen
 *  unterscheidbar machen, nicht Geheimnisse schuetzen. Bewusst ohne Node-Crypto —
 *  der Store sperrt Node-Builtins im Plugin-Code. */
export function hashPrompt(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Host+Port aus einer URL. Faellt auf "unbekannt" zurueck statt zu werfen:
 *  ein unparsbarer Endpunkt darf keinen Aufruf mitreissen. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unbekannt";
  }
}

export function buildTraceRecord(input: TraceInput): TraceRecord {
  const system = input.messages.find((m) => m.role === "system");
  return {
    id: input.id,
    ts: input.ts,
    plugin: input.plugin,
    feature: input.feature,
    model: input.model,
    endpointHost: hostOf(input.endpointUrl),
    ...(system ? { systemPromptHash: hashPrompt(system.content) } : {}),
    messages: input.messages,
    response: {
      content: input.content,
      ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    },
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
    latencyMs: input.latencyMs,
    ...(input.ttftMs != null ? { ttftMs: input.ttftMs } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}
