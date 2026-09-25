// The daily noon reminder: turning it on and off for this phone.
//
// A phone that turns it on is saved as households/{code}/devices/{deviceId}
// with its push subscription; /api/remind (run daily by Vercel) sends to it.

import { html, useState, useEffect } from "./lib.js";
import { LOCAL_MODE } from "./db.js";
import { storage } from "./util.js";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const onLocalhost = () => ["localhost", "127.0.0.1"].includes(location.hostname);

function deviceId() {
  let id = storage.get("deviceId");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    storage.set("deviceId", id);
  }
  return id;
}

async function post(body) {
  const res = await fetch("/api/remind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// The server's public key, from base64url text to the bytes the browser wants.
function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const deviceRecord = (sub, name) => ({ subscription: sub.toJSON(), name: name || null, enabled: true, updatedAt: Date.now() });

// When the app opens, re-save this phone's subscription if the browser has renewed it.
export async function refreshReminder(code, devices, name) {
  try {
    if (storage.get("reminders") !== code || !supported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub || sub.endpoint === storage.get("pushEndpoint")) return;
    devices.save(deviceId(), deviceRecord(sub, name));
    storage.set("pushEndpoint", sub.endpoint);
  } catch { /* not important enough to bother anyone about */ }
}

export function ReminderCard({ code, name, devices }) {
  const [server, setServer] = useState(null); // { enabled, publicKey } once known
  const [on, setOn] = useState(() => storage.get("reminders") === code);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const available = !LOCAL_MODE && !onLocalhost() && supported();

  useEffect(() => {
    if (!available) return;
    post({ code, action: "status" }).then(setServer).catch(() => setServer({ enabled: false }));
  }, [code]);

  const turnOn = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notifications are blocked for this app. In Chrome, open the site settings (the icon left of the address) and allow Notifications, then try again.");
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) }));
    devices.save(deviceId(), deviceRecord(sub, name));
    storage.set("reminders", code);
    storage.set("pushEndpoint", sub.endpoint);
  };

  const turnOff = async () => {
    devices.remove(deviceId());
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
    storage.set("reminders", null);
    storage.set("pushEndpoint", null);
  };

  const toggle = async (want) => {
    setBusy(true);
    setMessage(null);
    try {
      await (want ? turnOn() : turnOff());
      setOn(want);
    } catch (err) {
      setMessage({ error: true, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await post({ code, action: "test", deviceId: deviceId() });
      setMessage({ text: "Sent. It should appear in a few seconds." });
    } catch (err) {
      setMessage({ error: true, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (LOCAL_MODE || onLocalhost()) body = html`<p class="muted small">Not available while running locally.</p>`;
  else if (!supported()) body = html`<p class="muted small">This browser can't show notifications. On Android, use Chrome.</p>`;
  else if (!server) body = html`<p class="muted small">Checking…</p>`;
  else if (!server.enabled) body = html`<p class="muted small">Not set up yet for this share code. See SETUP_GUIDE.md.</p>`;
  else {
    body = html`
      <label class="toggle">
        <input type="checkbox" checked=${on} disabled=${busy} onChange=${(e) => toggle(e.target.checked)} />
        <span class="switch" />
        <span><strong>Remind me at noon</strong><br />
          <span class="muted small">If anything hasn't been logged today, including maintenance allergens.</span></span>
      </label>
      ${on && html`<button class="btn ghost small" onClick=${test} disabled=${busy}>Send a test notification</button>`}`;
  }

  return html`
    <section class="card">
      <h3>Daily reminder</h3>
      <p class="muted small">Just for this phone. Each person turns it on for themselves.</p>
      ${body}
      ${message && html`<p class=${"small " + (message.error ? "error-text" : "muted")}>${message.text}</p>`}
    </section>`;
}
