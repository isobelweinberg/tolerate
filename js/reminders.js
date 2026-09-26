// The daily noon reminder: turning it on and off for this phone.
//
// A phone that turns it on is saved as households/{code}/devices/{deviceId}
// with its push subscription and `muted`, the allergens this person doesn't
// want reminding about (so ones added later are included). /api/remind (run
// daily by Vercel) sends to it.

import { html, useState, useEffect } from "./lib.js";
import { LOCAL_MODE } from "./db.js";
import { allergensOf } from "./model.js";
import { AllergenBadge } from "./icons.js";
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

// Why the server says reminders aren't ready, in words that point at the fix.
function notReadyReason({ missing = [], codeMismatch, error }) {
  if (error) return `Couldn't reach the reminder service (${error}). Check the latest deployment in Vercel says Ready.`;
  if (missing.length) return `Not set up yet: add ${missing.join(", ")} in Vercel → Settings → Environment Variables, then redeploy.`;
  if (codeMismatch) return "HOUSEHOLD_CODE in Vercel doesn't match this share code.";
  return "Not set up yet for this share code. See SETUP_GUIDE.md.";
}

const mutedKey = (code) => "reminderMuted." + code;
const getMuted = (code) => storage.getJson(mutedKey(code), []);

const deviceRecord = (code, sub, name) => ({
  subscription: sub.toJSON(), name: name || null, enabled: true, muted: getMuted(code), updatedAt: Date.now(),
});

// When the app opens, re-save this phone's subscription if the browser has renewed it.
export async function refreshReminder(code, devices, name) {
  try {
    if (storage.get("reminders") !== code || !supported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub || sub.endpoint === storage.get("pushEndpoint")) return;
    devices.save(deviceId(), deviceRecord(code, sub, name));
    storage.set("pushEndpoint", sub.endpoint);
  } catch { /* not important enough to bother anyone about */ }
}

export function ReminderCard({ code, name, devices, data }) {
  const [server, setServer] = useState(null); // { enabled, publicKey } once known
  const [on, setOn] = useState(() => storage.get("reminders") === code);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [muted, setMuted] = useState(() => getMuted(code));
  const available = !LOCAL_MODE && !onLocalhost() && supported();

  useEffect(() => {
    if (!available) return;
    post({ code, action: "status" }).then(setServer).catch((err) => setServer({ enabled: false, error: err.message }));
  }, [code]);

  const turnOn = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notifications are blocked for this app. In Chrome, open the site settings (the icon left of the address) and allow Notifications, then try again.");
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) }));
    devices.save(deviceId(), deviceRecord(code, sub, name));
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

  // Tick or untick an allergen for this phone's reminder.
  const choose = async (allergenId, want) => {
    const next = want ? muted.filter((id) => id !== allergenId) : [...muted, allergenId];
    setMuted(next);
    storage.setJson(mutedKey(code), next);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) devices.save(deviceId(), deviceRecord(code, sub, name));
    } catch (err) {
      setMessage({ error: true, text: err.message });
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
  else if (!server.enabled) body = html`<p class="muted small">${notReadyReason(server)}</p>`;
  else {
    body = html`
      <label class="toggle">
        <input type="checkbox" checked=${on} disabled=${busy} onChange=${(e) => toggle(e.target.checked)} />
        <span class="switch" />
        <span><strong>Remind me at noon</strong><br />
          <span class="muted small">If anything hasn't been logged today, including maintenance allergens.</span></span>
      </label>
      ${on && html`<${AllergenChoice} data=${data} muted=${muted} onChoose=${choose} />`}
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

// Checkboxes for which allergens this phone gets reminded about.
export function AllergenChoice({ data, muted, onChoose }) {
  const children = [...data.children].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const groups = children.map((c) => ({ child: c, allergens: allergensOf(data, c.id) })).filter((g) => g.allergens.length);
  if (!groups.length) return null;
  return html`
    <div class="reminder-choice">
      <p class="label">Remind me about</p>
      ${groups.map(({ child, allergens }) => html`
        ${children.length > 1 && html`<p class="reorder-child">${child.name}</p>`}
        <ul class="check-list">
          ${allergens.map((a) => html`
            <li key=${a.id}>
              <label>
                <input type="checkbox" checked=${!muted.includes(a.id)} onChange=${(e) => onChoose(a.id, e.target.checked)} />
                <${AllergenBadge} allergen=${a} size=${20} />
                <span>${a.name}</span>
              </label>
            </li>`)}
        </ul>`)}
    </div>`;
}
