// Keeps the Google Sheet up to date. After any change made on this phone, the
// whole household is sent to /api/sync (a Vercel function), which rewrites the
// sheet: a summary tab plus one tab per allergen. Offline changes are sent once
// the phone is back online.

import { useState, useEffect, useRef, useCallback } from "./lib.js";
import { LOCAL_MODE } from "./db.js";
import { ENTRY_HEADER, entryRow, byNewest, formatAmount, storage } from "./util.js";

const DELAY_MS = 2500;

export function useSheetSync(code, data, name) {
  const [status, setStatus] = useState({ enabled: false, state: "idle" });
  const dirty = useRef(storage.get("sheetDirty") === code);
  const busy = useRef(false);
  const latest = useRef({ data, name });
  latest.current = { data, name };

  // Is a sheet set up for this household? (Not when running locally.)
  useEffect(() => {
    if (LOCAL_MODE) return;
    post({ code, action: "status" })
      .then((r) => setStatus((s) => ({ ...s, enabled: !!r.enabled, sheetUrl: r.sheetUrl })))
      .catch(() => {});
  }, [code]);

  const run = useCallback(async () => {
    const { data, name } = latest.current;
    if (!data || busy.current) return;
    busy.current = true;
    dirty.current = false;
    setStatus((s) => ({ ...s, state: "syncing", error: null }));
    try {
      await post({ code, action: "write", by: name, updated: new Date().toLocaleString("en-GB"), ...sheetContent(data) });
      if (!dirty.current) storage.set("sheetDirty", null);
      setStatus((s) => ({ ...s, state: "done", at: Date.now() }));
    } catch (err) {
      dirty.current = true;
      setStatus((s) => ({ ...s, state: "error", error: navigator.onLine ? err.message : "Offline: will update when back online" }));
    } finally {
      busy.current = false;
    }
  }, [code]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    storage.set("sheetDirty", code);
  }, [code]);

  // Send a little while after the data settles.
  useEffect(() => {
    if (!status.enabled || !dirty.current || !data) return;
    const timer = setTimeout(run, DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, status.enabled, run]);

  useEffect(() => {
    const onOnline = () => { if (status.enabled && dirty.current) run(); };
    addEventListener("online", onOnline);
    return () => removeEventListener("online", onOnline);
  }, [status.enabled, run]);

  return { status, markDirty, syncNow: run };
}

async function post(body) {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Sheet update failed (${res.status})`);
  return json;
}

// The rows to write: a summary, then a tab per allergen (newest entries first).
export function sheetContent({ children, allergens, foods, entries }) {
  const foodById = Object.fromEntries(foods.map((f) => [f.id, f]));
  const childById = Object.fromEntries(children.map((c) => [c.id, c]));
  const several = children.length > 1;
  const ordered = [...allergens].sort((a, b) =>
    (childById[a.childId]?.name || "").localeCompare(childById[b.childId]?.name || "") || a.name.localeCompare(b.name));

  const summary = [["Child", "Allergen", "Status", "Entries", "Last given", "Last food", "Last amount"]];
  const tabs = [];
  for (const a of ordered) {
    const child = childById[a.childId];
    const list = entries.filter((e) => e.allergenId === a.id).sort(byNewest);
    const last = list[0];
    const lastFood = last && foodById[last.foodId];
    summary.push([
      child?.name ?? "", a.name, a.maintenance ? "Maintenance ✓" : "In progress", list.length,
      last ? `${last.date} ${last.time || ""}`.trim() : "", lastFood?.name ?? "", last ? formatAmount(lastFood, last.amount) : "",
    ]);
    tabs.push({
      key: a.id,
      title: several && child ? `${child.name} · ${a.name}` : a.name,
      rows: [ENTRY_HEADER, ...list.map((e) => entryRow(e, foodById[e.foodId]))],
    });
  }
  return { summary, tabs };
}
