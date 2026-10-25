import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import type { NotificationType } from "@/shared/enums";
import { createAdminClient } from "./stubs/clients";

/**
 * Demo SMS for event updates. Off unless SMS_DEMO_TO and SMS_DEMO_USER_EMAIL are set; then only
 * that one user's event notifications are texted, to that one number. Without Twilio keys the
 * text is logged instead of sent, so CI and machines without keys behave exactly as before.
 */
export type SmsConfig = {
  to: string;
  userEmail: string;
  siteUrl: string | null;
  twilio: { accountSid: string; authToken: string; from: string } | null;
};

const E164 = /^\+[1-9]\d{7,14}$/;
const TEXTED_TYPES: ReadonlySet<NotificationType> = new Set([
  "rsvp_confirmed", "event_updated", "event_cancelled", "reconnect_suggestion",
]);

export function smsConfig(env: Readonly<Record<string, string | undefined>> = process.env): SmsConfig | null {
  const to = env.SMS_DEMO_TO?.trim();
  const userEmail = env.SMS_DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!to || !userEmail || !E164.test(to)) return null;
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM?.trim();
  return {
    to,
    userEmail,
    siteUrl: env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || null,
    twilio: accountSid && authToken && from ? { accountSid, authToken, from } : null,
  };
}

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** The text for one event notification, or null for types that are never texted. */
export function eventSmsText(
  type: NotificationType, payload: Record<string, unknown>, eventTitle: string | null, siteUrl: string | null,
): string | null {
  if (!TEXTED_TYPES.has(type)) return null;
  const title = eventTitle ?? "your event";
  const href = str(payload.href);
  const link = siteUrl && href ? ` ${siteUrl}${href}` : "";
  switch (type) {
    case "rsvp_confirmed":
      return payload.promotedFromWaitlist === true
        ? `Weave: a spot opened up. You're in for ${title}.${link}`
        : `Weave: you're going to ${title}.${link}`;
    case "event_updated":
      return `Weave: ${title} changed. Please reconfirm your spot.${link}`;
    case "event_cancelled": {
      const reason = str(payload.reason);
      return `Weave: ${title} was cancelled${reason ? `: ${reason}` : "."}${link}`;
    }
    case "reconnect_suggestion":
      return payload.accepted === true
        ? `Weave: you're both in for a follow-up.${link}`
        : `Weave: your agents found a follow-up with someone from ${title}.${link}`;
    default:
      return null;
  }
}

async function eventTitle(admin: SupabaseClient, payload: Record<string, unknown>): Promise<string | null> {
  const fromPayload = str(payload.title);
  const eventId = str(payload.eventId);
  if (fromPayload || !eventId) return fromPayload;
  const { data } = await admin.from("events").select("title").eq("id", eventId).maybeSingle();
  return str(data?.title);
}

async function sendTwilio(config: SmsConfig, text: string): Promise<void> {
  const { accountSid, authToken, from } = config.twilio!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: config.to, From: from, Body: text }),
  });
  if (!res.ok) throw new Error(`Twilio answered ${res.status}`);
}

/** Texts one event notification to the demo number. Never throws: a missed text must not fail an RSVP. */
export async function textEventNotification(
  userId: string, type: NotificationType, payload: Record<string, unknown>, config: SmsConfig | null = smsConfig(),
): Promise<void> {
  if (!config || !TEXTED_TYPES.has(type)) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data.user?.email?.toLowerCase() !== config.userEmail) return;
    const text = eventSmsText(type, payload, await eventTitle(admin, payload), config.siteUrl);
    if (!text) return;
    if (!config.twilio) {
      log.info("sms.console", { userId, type, text });
      return;
    }
    await sendTwilio(config, text);
    log.info("sms.sent", { userId, type });
  } catch (err) {
    log.warn("sms.failed", { userId, type, detail: (err as Error).message });
  }
}

type Notify = (userId: string, type: NotificationType, payload?: Record<string, unknown>) => Promise<void>;

/** Wraps 01's notify so event notifications also reach the demo phone. */
export function withEventSms(notify: Notify): Notify {
  return async (userId, type, payload = {}) => {
    await notify(userId, type, payload);
    await textEventNotification(userId, type, payload);
  };
}
