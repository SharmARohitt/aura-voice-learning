/**
 * Configurable embedding layer.
 *
 * The provider, model and dimensionality come from environment configuration,
 * never from hard-coded call sites. Every stored vector records the version
 * string it was produced with, so switching model re-embeds progressively
 * instead of silently mixing incompatible vector spaces.
 */

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  /** Stored alongside each vector — "<provider>:<model>:<dims>". */
  readonly version: string;
  embed(inputs: string[]): Promise<number[][]>;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

/** Google's multimodal embedding model caps a request at 100 inputs. */
const BATCH_LIMIT = 64;

class GatewayEmbeddingProvider implements EmbeddingProvider {
  readonly id = "lovable-gateway";
  constructor(
    readonly model: string,
    readonly dimensions: number,
  ) {}

  get version(): string {
    return `${this.id}:${this.model}:${this.dimensions}`;
  }

  async embed(inputs: string[]): Promise<number[][]> {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Embedding provider is not configured.");
    const out: number[][] = [];

    for (let i = 0; i < inputs.length; i += BATCH_LIMIT) {
      const batch = inputs.slice(i, i + BATCH_LIMIT);
      const res = await fetch(`${GATEWAY_URL}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: this.model, input: batch }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[embeddings] request failed", res.status, body.slice(0, 300));
        throw new Error(`Embedding request failed (${res.status}).`);
      }
      const data = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
      const rows = (data.data ?? []).slice().sort((a, b) => a.index - b.index);
      for (const row of rows) out.push(row.embedding);
    }
    return out;
  }
}

let provider: EmbeddingProvider | null = null;

export function embeddingProvider(): EmbeddingProvider {
  if (provider) return provider;
  const model = process.env["EMBEDDING_MODEL"] ?? "google/gemini-embedding-2";
  const dimensions = Number(process.env["EMBEDDING_DIMENSIONS"] ?? 3072);
  provider = new GatewayEmbeddingProvider(model, dimensions);
  return provider;
}

/** Embed one query string. Used at search time only, never for indexing. */
export async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const [vector] = await embeddingProvider().embed([text]);
    return vector ?? null;
  } catch (error) {
    console.error("[embeddings] query embedding failed", error);
    return null;
  }
}
