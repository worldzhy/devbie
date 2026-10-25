import { redact } from "../redact";
import { stringOrNull } from "./record";
import type { NormalizedRecord } from "./types";

/**
 * Claude Code transcript line: `message.content` is either a plain string or
 * an array of text / tool_use / tool_result blocks.
 */
export function normalizeClaudeRecord(record: Record<string, unknown>): NormalizedRecord | null {
  const type = stringOrNull(record.type);

  if (type === "summary" || type === "system") {
    return null;
  }

  const message = record.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const container = message.content;
  const model = stringOrNull(message.model) ?? undefined;

  if (typeof container === "string") {
    return {
      role: type === "assistant" ? "assistant" : "user",
      content: redact(container),
      model,
      toolNames: [],
      toolCalls: [],
    };
  }

  if (!Array.isArray(container)) return null;

  const texts: string[] = [];
  const toolCalls: { name: string; filePath?: string; input?: unknown }[] = [];
  let role: NormalizedRecord["role"] = type === "assistant" ? "assistant" : "user";

  for (const block of container) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    const blockType = stringOrNull(item.type);

    if (blockType === "text") {
      const text = stringOrNull(item.text);
      if (text) texts.push(text);
    } else if (blockType === "tool_use") {
      const name = stringOrNull(item.name) ?? "unknown";
      const input = item.input as Record<string, unknown> | undefined;
      toolCalls.push({
        name,
        filePath: stringOrNull(input?.["file_path"]) ?? stringOrNull(input?.["path"]) ?? undefined,
        input,
      });
    } else if (blockType === "tool_result") {
      role = "tool";
      const output = item.content;
      if (typeof output === "string") texts.push(output);
      else if (Array.isArray(output)) {
        for (const part of output) {
          if (part && typeof part === "object") {
            const text = stringOrNull((part as Record<string, unknown>).text);
            if (text) texts.push(text);
          }
        }
      }
    }
  }

  if (texts.length === 0 && toolCalls.length === 0) return null;

  return {
    role,
    content: redact(texts.join("\n")),
    model,
    toolNames: toolCalls.map((call) => call.name),
    toolCalls,
  };
}
