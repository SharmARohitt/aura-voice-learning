/**
 * Thin server-only client for the Lovable AI Gateway (OpenAI-compatible).
 * Keeps the API key server-side and gives every caller consistent errors.
 */

export const CHAT_MODEL = "google/gemini-3.7-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayError(401, "AI provider is not configured.", false);
  return key;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatJson<T>(messages: ChatMessage[], signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
    ...(signal ? { signal } : {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    let message = "The tutor is temporarily unavailable.";
    if (res.status === 402) message = "AI credits are exhausted for this workspace.";
    if (res.status === 429) message = "Too many requests right now — retrying shortly.";
    console.error("[ai-gateway] chat failed", res.status, body.slice(0, 400));
    throw new GatewayError(res.status, message, retryable);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseLooseJson<T>(content);
  if (parsed !== null) return parsed;
  console.error("[ai-gateway] unparsable model output", content.slice(0, 400));
  throw new GatewayError(502, "The tutor returned an unreadable response.", true);

}

/**
 * Plain-text completion with a hard output cap — used for the fast first
 * response so the student hears something within about a second.
 */
export async function chatText(
  messages: ChatMessage[],
  maxTokens = 160,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: CHAT_MODEL, messages, max_tokens: maxTokens }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[ai-gateway] quick chat failed", res.status, body.slice(0, 300));
    throw new GatewayError(
      res.status,
      res.status === 402
        ? "AI credits are exhausted for this workspace."
        : "The tutor is temporarily unavailable.",
      res.status === 429 || res.status >= 500,
    );
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function transcribeAudio(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("language", "hi");

  const res = await fetch(`${GATEWAY_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[ai-gateway] stt failed", res.status, body.slice(0, 300));
    throw new GatewayError(
      res.status,
      "Speech recognition is unavailable — you can type your doubt instead.",
      res.status === 429 || res.status >= 500,
    );
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export function speechRequest(text: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${GATEWAY_URL}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: "alloy",
      instructions:
        "Speak as a warm, confident Indian tutor. Natural Hinglish pronunciation, unhurried, encouraging.",
      stream_format: "sse",
      response_format: "pcm",
    }),
    ...(signal ? { signal } : {}),
  });
}
