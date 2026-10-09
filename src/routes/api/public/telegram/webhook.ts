import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256")
    .update(`telegram-webhook:${telegramApiKey}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function reply(chatId: number, text: string) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;
  await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
        if (!TELEGRAM_API_KEY) {
          return new Response("Server configuration error", { status: 500 });
        }

        const expected = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();
        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        if (typeof chatId !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const name =
          [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ") ||
          message?.chat?.title ||
          null;
        const { error } = await supabaseAdmin
          .from("telegram_chats")
          .upsert({ chat_id: chatId, label: name }, { onConflict: "chat_id" });
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        await reply(
          chatId,
          "SNOVA alerts are now on for this chat. You'll hear from me when a control-dish reading looks wrong, when snails barely ate, or when expected entries are missing.",
        );
        return Response.json({ ok: true });
      },
    },
  },
});
