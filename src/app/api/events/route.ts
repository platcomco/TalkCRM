import { NextRequest } from "next/server";
import { callEvents } from "@/lib/event-emitter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection packet
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: "connected", time: new Date() })}\n\n`)
      );

      const onAnyCall = ({ event, payload }: { event: string; payload: any }) => {
        try {
          const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch (err) {
          console.error("Error writing SSE event:", err);
        }
      };

      callEvents.on("any_call", onAnyCall);

      // Heartbeat every 25 seconds to keep connection alive
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: "keepalive"\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        callEvents.off("any_call", onAnyCall);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
