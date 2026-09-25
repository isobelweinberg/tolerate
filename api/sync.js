// Vercel serverless function: writes the household's data to a Google Sheet.
//
// Needs three environment variables in Vercel (see SETUP_GUIDE.md):
//   GOOGLE_SERVICE_ACCOUNT  the service account's JSON key, pasted in whole
//   SHEET_ID                the long id in the sheet's URL
//   HOUSEHOLD_CODE          the app's share code; only this household may write
//
// POST { code, action: "status" }  -> { enabled, sheetUrl }
// POST { code, action: "write", by, updated, summary: rows, tabs: [{ key, title, rows }] }
//
// Tabs this function creates are tagged (developer metadata "tolerate" = key),
// so it can rename, reorder and remove its own tabs without touching any others.

const { createSign } = require("node:crypto");

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const TAG = "tolerate";
const SUMMARY_KEY = "summary";
const SUMMARY_TITLE = "TolerATE summary";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { GOOGLE_SERVICE_ACCOUNT, SHEET_ID, HOUSEHOLD_CODE } = process.env;
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const configured = !!(GOOGLE_SERVICE_ACCOUNT && SHEET_ID && HOUSEHOLD_CODE);
  const allowed = configured && body.code === HOUSEHOLD_CODE.trim().toUpperCase();

  if (body.action === "status") {
    return res.status(200).json(allowed
      ? { enabled: true, sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` }
      : { enabled: false });
  }
  if (!configured) return res.status(501).json({ error: "Google Sheet not set up" });
  if (!allowed) return res.status(403).json({ error: "This household isn't linked to the sheet" });
  if (body.action !== "write" || !Array.isArray(body.tabs)) return res.status(400).json({ error: "Bad request" });

  try {
    const token = await accessToken(JSON.parse(GOOGLE_SERVICE_ACCOUNT));
    await writeSheet(token, SHEET_ID, body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// --- Google auth: a signed JWT swapped for an access token ------------------------

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description || json.error}`);
  return json.access_token;
}

async function api(token, path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API: ${json.error?.message || res.status}`);
  return json;
}

// --- Writing ---------------------------------------------------------------------

async function writeSheet(token, sheetId, { summary = [], tabs, by, updated }) {
  const info = await api(token, `/${sheetId}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)),developerMetadata(metadataKey,metadataValue))`);

  const managed = new Map(); // key -> sheet properties
  const unmanagedTitles = new Set();
  for (const s of info.sheets) {
    const key = (s.developerMetadata || []).find((m) => m.metadataKey === TAG)?.metadataValue;
    if (key) managed.set(key, s.properties);
    else unmanagedTitles.add(s.properties.title.toLowerCase());
  }

  const summaryRows = [...summary, [], ["Last updated", updated || new Date().toISOString(), by ? `by ${by}` : ""]];
  const wanted = [{ key: SUMMARY_KEY, title: SUMMARY_TITLE, rows: summaryRows }, ...tabs];

  // Clean, unique tab titles.
  const used = new Set(unmanagedTitles);
  for (const tab of wanted) {
    const base = String(tab.title || "Untitled").replace(/[[\]*?:/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Untitled";
    let title = base;
    for (let n = 2; used.has(title.toLowerCase()); n++) title = `${base} (${n})`;
    used.add(title.toLowerCase());
    tab.title = title;
    tab.rowCount = Math.max(1000, tab.rows.length + 200);
  }

  const wantedKeys = new Set(wanted.map((t) => t.key));
  const requests = [];

  // 1. Move renamed tabs out of the way, so titles can swap freely.
  for (const tab of wanted) {
    const existing = managed.get(tab.key);
    if (existing && existing.title !== tab.title) {
      requests.push({ updateSheetProperties: { properties: { sheetId: existing.sheetId, title: `~${existing.sheetId}` }, fields: "title" } });
    }
  }
  // 2. Remove tabs for allergens that no longer exist.
  for (const [key, props] of managed) {
    if (!wantedKeys.has(key)) requests.push({ deleteSheet: { sheetId: props.sheetId } });
  }
  // 3. Add new tabs, and set every tab's title, position and size.
  wanted.forEach((tab, index) => {
    const existing = managed.get(tab.key);
    if (existing) {
      const needsRows = (existing.gridProperties?.rowCount || 0) < tab.rows.length + 10;
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: existing.sheetId, title: tab.title, index, ...(needsRows && { gridProperties: { rowCount: tab.rowCount } }) },
          fields: needsRows ? "title,index,gridProperties.rowCount" : "title,index",
        },
      });
    } else {
      const sheetIdNew = Math.floor(Math.random() * 2_000_000_000);
      requests.push(
        { addSheet: { properties: { sheetId: sheetIdNew, title: tab.title, index, gridProperties: { rowCount: tab.rowCount, frozenRowCount: 1 } } } },
        { createDeveloperMetadata: { developerMetadata: { metadataKey: TAG, metadataValue: tab.key, location: { sheetId: sheetIdNew }, visibility: "DOCUMENT" } } },
        { repeatCell: { range: { sheetId: sheetIdNew, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      );
      tab.sheetId = sheetIdNew;
    }
    if (existing) tab.sheetId = existing.sheetId;
  });

  await api(token, `/${sheetId}:batchUpdate`, { method: "POST", body: { requests } });

  // Replace the contents of every tab.
  const range = (title) => `'${title.replace(/'/g, "''")}'`;
  await api(token, `/${sheetId}/values:batchClear`, { method: "POST", body: { ranges: wanted.map((t) => range(t.title)) } });
  await api(token, `/${sheetId}/values:batchUpdate`, {
    method: "POST",
    body: {
      valueInputOption: "USER_ENTERED",
      data: wanted.map((t) => ({ range: `${range(t.title)}!A1`, values: t.rows.map((r) => r.map(cell)) })),
    },
  });

  await api(token, `/${sheetId}:batchUpdate`, {
    method: "POST",
    body: {
      requests: wanted.map((t) => ({
        autoResizeDimensions: { dimensions: { sheetId: t.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 9 } },
      })),
    },
  });
}

// Text that looks like a formula is kept as plain text.
function cell(value) {
  if (value == null) return "";
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}
