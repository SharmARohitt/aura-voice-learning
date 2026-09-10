import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SourceResolution } from "@/lib/types";

const Input = z.object({
  chunk_id: z.string().min(1).max(80),
  subject: z.string().max(60).default(""),
  chapter: z.string().max(80).default(""),
  topic: z.string().max(80).default(""),
  class_level: z.string().max(40).default(""),
  lecture_title: z.string().max(160).default(""),
  timestamp_start: z.string().max(12).optional(),
  timestamp_end: z.string().max(12).optional(),
  source_url: z.string().url().max(400).optional(),
  relevance: z.number().min(0).max(1).default(0),
});

/**
 * Source verification runs on its own path — the answer is already on screen
 * (and being spoken) by the time this resolves a playable destination.
 */
export const resolveReplaySource = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<SourceResolution> => {
    const { resolveSource } = await import("@/lib/sources/resolver.server");
    try {
      return await resolveSource(data);
    } catch (error) {
      console.error("[sources] resolution failed", (error as Error).message);
      return {
        chunk_id: data.chunk_id,
        kind: "unavailable",
        target: null,
        reason: "Source verification is temporarily unavailable.",
        content_relevance: data.relevance,
        source_usability: 0,
        validation_ms: 0,
        cached: false,
      };
    }
  });
