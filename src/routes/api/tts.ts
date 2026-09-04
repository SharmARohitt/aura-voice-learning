import { createFileRoute } from "@tanstack/react-router";
import { speechRequest } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let text = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          text = typeof body.text === "string" ? body.text.slice(0, 1500).trim() : "";
        } catch {
          return new Response("Invalid request body", { status: 400 });
        }
        if (!text) return new Response("Missing text", { status: 400 });

        try {
          const upstream = await speechRequest(text, request.signal);
          if (!upstream.ok || !upstream.body) {
            const status = upstream.status === 429 ? 429 : 502;
            return new Response("Voice synthesis unavailable", { status });
          }
          return new Response(upstream.body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
          });
        } catch (error) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("[api/tts]", error);
          return new Response("Voice synthesis unavailable", { status: 502 });
        }
      },
    },
  },
});
