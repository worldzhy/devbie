import { redact } from "../redact";
import { stringOrNull } from "./record";
import type { NormalizedRecord } from "./types";

/** Codex transcript line: the interesting fields live under `payload`. */
export function normalizeCodexRecord(record: Record<string, unknown>): NormalizedRecord | null {
  const payload = record.payload as Record<string, unknown> | undefined;
  if (!payload) return null;
  const payloadType = stringOrNull(payload.type);
  if (payloadType === "agent_message") {
    const text = stringOrNull(payload.message);
    return text ? { role: "assistant", content: redact(text), toolNames: [], toolCalls: [] } : null;
  }
  if (payloadType === "message") {
    const role = stringOrNull(payload.role) === "assistant" ? "assistant" : "user";
    const content = payload.content;
    const texts: string[] = [];
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object") {
          const text =
            stringOrNull((part as Record<string, unknown>).text) ??
            stringOrNull((part as Record<string, unknown>).input_text);
          if (text) texts.push(text);
        }
      }
    } else if (typeof content === "string") {
      texts.push(content);
    }
    return texts.length > 0 ? { role, content: redact(texts.join("\n")), toolNames: [], toolCalls: [] } : null;
  }
  if (payloadType === "function_call") {
    const name = stringOrNull(payload.name) ?? "unknown";
    return { role: "tool", content: "", toolNames: [name], toolCalls: [{ name }] };
  }
  return null;
}
