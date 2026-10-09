/**
 * Server-only Telegram alerting. Sends a message to every chat that has
 * registered with the bot (see src/routes/api/public/telegram/webhook.ts),
 * deduplicated by alert key so the same alert is never sent twice.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

async function sendMessage(chatId: number, text: string) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram sendMessage failed [${res.status}]: ${body}`);
  }
}

/**
 * Send an alert once. Returns true when the message was actually sent (false
 * when this alert key was already sent before, or no chats are registered).
 */
export async function sendTelegramAlert(alertKey: string, text: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Claim the alert key first; a conflict means it was already sent.
  const { error: claimError } = await supabaseAdmin
    .from("alert_log")
    .insert({ alert_key: alertKey });
  if (claimError) return false;

  const { data: chats } = await supabaseAdmin.from("telegram_chats").select("chat_id");
  if (!chats?.length) return false;

  await Promise.all(chats.map((c) => sendMessage(Number(c.chat_id), text)));
  return true;
}

/**
 * Claim a batch of alert keys and send the not-yet-sent ones as ONE combined
 * message. Returns the number of new alerts included (0 = nothing sent).
 */
export async function sendTelegramAlertBatch(
  alerts: { key: string; text: string }[],
  header: string,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!alerts.length) return 0;

  const fresh: string[] = [];
  for (const a of alerts) {
    const { error } = await supabaseAdmin.from("alert_log").insert({ alert_key: a.key });
    if (!error) fresh.push(a.text);
  }
  if (!fresh.length) return 0;

  const { data: chats } = await supabaseAdmin.from("telegram_chats").select("chat_id");
  if (!chats?.length) return 0;

  const text = `${header}\n${fresh.map((t) => `• ${t}`).join("\n")}`;
  await Promise.all(chats.map((c) => sendMessage(Number(c.chat_id), text)));
  return fresh.length;
}
