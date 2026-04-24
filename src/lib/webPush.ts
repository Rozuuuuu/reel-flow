import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";

const SW_PATH = "/sw.js";

const urlB64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const pushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const ensureRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!pushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
};

export const getCurrentSubscription = async (): Promise<PushSubscription | null> => {
  const reg = await ensureRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
};

const fetchVapidPublicKey = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.functions.invoke("push-config");
    if (error) return null;
    const key = (data as { vapidPublicKey?: string } | null)?.vapidPublicKey;
    return key && key.length > 0 ? key : null;
  } catch {
    return null;
  }
};

export const subscribeToPush = async (
  userId: string,
): Promise<{ ok: boolean; reason?: string }> => {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied")
    return { ok: false, reason: "denied" };

  const reg = await ensureRegistration();
  if (!reg) return { ok: false, reason: "sw-failed" };

  const vapid = await fetchVapidPublicKey();
  if (!vapid) return { ok: false, reason: "no-vapid" };

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };
  }

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapid),
    }));

  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "invalid-sub" };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, reason: error.message };

  void trackEvent("push_subscribe", { props: { ua: navigator.userAgent.slice(0, 80) } });
  return { ok: true };
};

export const unsubscribeFromPush = async (): Promise<boolean> => {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  void trackEvent("push_unsubscribe", {});
  return true;
};
