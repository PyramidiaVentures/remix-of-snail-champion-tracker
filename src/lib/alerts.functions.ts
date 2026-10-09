import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTelegramAlertBatch } from "@/lib/telegram.server";

/**
 * Push a day's exceptions to Telegram as ONE combined message per site.
 * Called from the dashboard after the day review is computed; each alert is
 * deduplicated by key so browsing the same day twice never re-sends. Only
 * the alert-worthy groups are sent: suspicious control readings, "almost
 * nothing eaten", overdue weighings and missing entries.
 */
export const pushDayAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date: string; siteName: string; alerts: { key: string; text: string }[] }) => input)
  .handler(async ({ data }) => {
    const wanted = data.alerts
      .filter(
        (a) =>
          a.key.startsWith("control-suspect-") ||
          a.key.startsWith("not-eaten-") ||
          a.key.startsWith("overdue-") ||
          (a.key.startsWith("pm-") && !a.key.startsWith("pmstep-")) ||
          (a.key.startsWith("am-") && !a.key.startsWith("amstep-")),
      )
      .map((a) => ({ key: `${data.date}:${a.key}`, text: a.text }));
    const site = data.siteName ? ` [${data.siteName}]` : "";
    const sent = await sendTelegramAlertBatch(wanted, `🐌 SNOVA${site} — ${data.date}`);
    return { sent };
  });
