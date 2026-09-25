// Vercel serverless function: the daily "nothing logged yet" reminder.
//
// Vercel's cron (see vercel.json) calls this at 11:00 and 12:00 UTC. It only
// sends during the 12 o'clock hour in REMINDER_TIMEZONE, so the reminder
// arrives around noon in both GMT and BST.
//
// Environment variables in Vercel (see SETUP_GUIDE.md):
//   GOOGLE_SERVICE_ACCOUNT  same as the Sheet sync; also needs the "Cloud Datastore User" role
//   HOUSEHOLD_CODE          same as the Sheet sync
//   VAPID_PUBLIC_KEY        } the key pair phones use to trust these notifications
//   VAPID_PRIVATE_KEY       }
//   CRON_SECRET             any long random text; Vercel sends it with each cron call
//   REMINDER_TIMEZONE       optional, defaults to Europe/London
//
// GET  (from Vercel cron)                       -> sends reminders if it's noon
// POST { code, action: "status" }               -> { enabled, publicKey }
// POST { code, action: "test", deviceId }       -> sends a test to that phone

const webpush = require("web-push");
const { accessToken, readBody } = require("./_google");

const REMINDER_HOUR = 12;

module.exports = async function handler(req, res) {
  const env = process.env;
  const configured = !!(env.GOOGLE_SERVICE_ACCOUNT && env.HOUSEHOLD_CODE && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const code = env.HOUSEHOLD_CODE?.trim().toUpperCase();

  try {
    if (req.method === "GET") {
      if (!env.CRON_SECRET || req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Not allowed" });
      }
      if (!configured) return res.status(501).json({ error: "Reminders not set up" });
      const zone = env.REMINDER_TIMEZONE || "Europe/London";
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      if (hour !== REMINDER_HOUR && req.query?.force !== "1") return res.status(200).json({ skipped: `It's ${hour}:00 in ${zone}` });
      return res.status(200).json(await sendDaily(code, today(zone)));
    }

    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });
    const body = readBody(req);
    const allowed = configured && body.code === code;
    if (body.action === "status") {
      if (allowed) return res.status(200).json({ enabled: true, publicKey: env.VAPID_PUBLIC_KEY });
      // Say what's wrong (names only, never values) so it can be fixed.
      const missing = ["GOOGLE_SERVICE_ACCOUNT", "HOUSEHOLD_CODE", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET"]
        .filter((name) => !env[name]);
      return res.status(200).json({ enabled: false, missing, codeMismatch: !missing.includes("HOUSEHOLD_CODE") && body.code !== code });
    }
    if (!allowed) return res.status(403).json({ error: "Reminders aren't set up for this household" });
    if (body.action === "test") {
      const db = await firestore(code);
      const device = await db.get("devices", String(body.deviceId || ""));
      if (!device?.subscription) return res.status(404).json({ error: "This phone isn't signed up for reminders" });
      await push(db, device, { title: "TolerATE", body: "Reminders are working. You'll get one at noon if anything hasn't been logged.", tag: "tolerate-test" });
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Bad request" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// "2026-09-25" in the given time zone.
const today = (zone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// Works out what hasn't been logged today and tells every phone that's signed up.
async function sendDaily(code, date) {
  const db = await firestore(code);
  const [children, allergens, entries, devices] = await Promise.all([
    db.list("children"), db.list("allergens"), db.entriesOn(date), db.list("devices"),
  ]);
  const given = new Set(entries.map((e) => e.allergenId));
  const lines = children
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((child) => {
      const missing = allergens
        .filter((a) => a.childId === child.id && !given.has(a.id))
        .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0))
        .map((a) => a.name);
      return missing.length ? `${child.name}: ${missing.join(", ")}` : null;
    })
    .filter(Boolean);

  if (!lines.length) return { sent: 0, reason: "Everything logged" };
  const message = { title: "Not logged yet today", body: lines.join("\n"), tag: "tolerate-daily" };
  const targets = devices.filter((d) => d.enabled && d.subscription);
  const results = await Promise.allSettled(targets.map((d) => push(db, d, message)));
  return { sent: results.filter((r) => r.status === "fulfilled").length, of: targets.length, date, lines };
}

// Sends one notification. Phones that have gone away are removed.
async function push(db, device, message) {
  try {
    await webpush.sendNotification(device.subscription, JSON.stringify(message), {
      TTL: 6 * 60 * 60,
      urgency: "normal",
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT || "mailto:reminders@tolerate.invalid",
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      },
    });
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) await db.remove("devices", device.id);
    throw err;
  }
}

// --- Firestore, through its REST API -------------------------------------------------

async function firestore(code) {
  const account = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const token = await accessToken(account, "https://www.googleapis.com/auth/datastore");
  const root = `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;
  const base = `${root}/households/${encodeURIComponent(code)}`;

  const call = async (url, { method = "GET", body } = {}) => {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 404 && method === "GET") return null;
    if (!res.ok) throw new Error(`Firestore: ${json.error?.message || json[0]?.error?.message || res.status}`);
    return json;
  };
  const toObject = (doc) => ({ id: doc.name.split("/").pop(), ...fields(doc.fields || {}) });

  return {
    async list(col) {
      const out = [];
      let page = "";
      do {
        const json = await call(`${base}/${col}?pageSize=300${page ? `&pageToken=${page}` : ""}`);
        out.push(...(json?.documents || []).map(toObject));
        page = json?.nextPageToken || "";
      } while (page);
      return out;
    },
    async get(col, id) {
      const doc = await call(`${base}/${col}/${encodeURIComponent(id)}`);
      return doc && toObject(doc);
    },
    async entriesOn(date) {
      const rows = await call(`${base}:runQuery`, {
        method: "POST",
        body: {
          structuredQuery: {
            from: [{ collectionId: "entries" }],
            where: { fieldFilter: { field: { fieldPath: "date" }, op: "EQUAL", value: { stringValue: date } } },
          },
        },
      });
      return (rows || []).filter((r) => r.document).map((r) => toObject(r.document));
    },
    remove: (col, id) => call(`${base}/${col}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

// Firestore's typed values -> plain JavaScript.
function value(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(value);
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}

function fields(f) {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, value(v)]));
}
