/** Browser side of Web Push for price alerts. Called only after the user chose push for an alert. */

export type PushSetupResult = { ok: true; subscription: PushSubscriptionJSON } | { ok: false; reason: "unsupported" | "denied" | "error" };

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Asks for permission (if needed) and returns the push subscription of this browser. */
export async function setupPush(vapidPublicKey: string | undefined): Promise<PushSetupResult> {
  if (!vapidPublicKey || !pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") return { ok: false, reason: "denied" };
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
    return { ok: true, subscription: sub.toJSON() };
  } catch {
    return { ok: false, reason: "error" };
  }
}
