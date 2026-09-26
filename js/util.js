// Small helpers shared by the whole app: scales, numbers, dates, CSV, storage.

// --- Scales ------------------------------------------------------------------

// `short` is used where space is tight (the picker when adding a food).
export const SCALES = [
  { id: "g", label: "Grams", short: "Grams" },
  { id: "ml", label: "Millilitres", short: "ml" },
  { id: "prop", label: "Proportion", short: "Proportion" },
  { id: "tsp", label: "Teaspoons", short: "tsp" },
  { id: "custom", label: "Custom", short: "Custom" },
];

// Grams and millilitres can have "allergen protein per 100 g / 100 ml", and so an mg estimate.
export const hasProteinScale = (scale) => scale === "g" || scale === "ml";

// "per 100 g" or "per 100 ml".
export const per100 = (scale) => `per 100 ${scale === "ml" ? "ml" : "g"}`;

export const PROPORTIONS = [
  { value: 1 / 8, label: "⅛" },
  { value: 1 / 4, label: "¼" },
  { value: 1 / 3, label: "⅓" },
  { value: 1 / 2, label: "½" },
  { value: 2 / 3, label: "⅔" },
  { value: 3 / 4, label: "¾" },
  { value: 1, label: "Whole" },
  { value: 1.5, label: "1½" },
  { value: 2, label: "2" },
];

export const propLabel = (value) =>
  PROPORTIONS.find((p) => Math.abs(p.value - value) < 1e-6)?.label ?? trimNum(value);

// Short unit shown after a number ("g", "tsp", "biscuits"). Proportions have none.
export function unitOf(food) {
  if (!food) return "";
  if (food.scale === "g") return "g";
  if (food.scale === "ml") return "ml";
  if (food.scale === "tsp") return "tsp";
  if (food.scale === "custom") return food.unit || "";
  return "";
}

export function scaleDescription(food) {
  if (food.scale === "custom") return food.unit ? `Custom (${food.unit})` : "Custom";
  return SCALES.find((s) => s.id === food.scale)?.label ?? food.scale;
}

export function formatAmount(food, amount) {
  if (amount == null || Number.isNaN(amount)) return "";
  if (food?.scale === "prop") return propLabel(amount);
  const unit = unitOf(food);
  return unit ? `${trimNum(amount)} ${unit}` : trimNum(amount);
}

// --- Numbers -----------------------------------------------------------------

// "2.50" -> "2.5", 3 -> "3". Up to `dp` decimal places.
export const trimNum = (n, dp = 2) => String(Number(Number(n).toFixed(dp)));

// Reads a number typed by a person ("2,5" works too). Returns null if blank or invalid.
export function parseNum(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(",", ".");
  if (s === "" || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  return Number(s);
}

export const round2 = (n) => Math.round(n * 100) / 100;

// Allergen protein in mg, for foods in grams or ml with a known protein content.
// `proteinPct` is grams of allergen protein per 100 g (or per 100 ml), so
// amount × (proteinPct / 100) g × 1000 mg/g  =  amount × proteinPct × 10
export function proteinMg(food, amount) {
  if (!food || !hasProteinScale(food.scale) || food.proteinPct == null || amount == null) return null;
  return amount * food.proteinPct * 10;
}

export function formatMg(mg) {
  if (mg == null) return "";
  const dp = mg < 10 ? 2 : mg < 100 ? 1 : 0;
  return `${Number(mg.toFixed(dp)).toLocaleString("en-GB")} mg`;
}

// --- Dates -------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");

// Local-time date key like "2026-09-22".
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function parseDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(key, { relative = true, weekday = true } = {}) {
  if (!key) return "";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (relative && key === dayKey()) return "Today";
  if (relative && key === dayKey(yesterday)) return "Yesterday";
  const date = parseDay(key);
  const opts = { day: "numeric", month: "short" };
  if (weekday) opts.weekday = "short";
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString("en-GB", opts);
}

// Newest first: by date, then time (untimed entries count as the start of the
// day), then when they were recorded.
export function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ta = a.time || "", tb = b.time || "";
  if (ta !== tb) return ta < tb ? 1 : -1;
  return (b.clientTime || 0) - (a.clientTime || 0);
}

// --- CSV ---------------------------------------------------------------------

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// One row per entry, as used by both the CSV export and the Google Sheet.
export const ENTRY_HEADER = [
  "Date", "Time", "Food", "Amount", "Unit", "Protein (g per 100 g or ml)", "Allergen protein (mg)", "Reaction / notes", "Recorded by",
];

export function entryRow(entry, food) {
  const mg = proteinMg(food, entry.amount);
  return [
    entry.date,
    entry.time || "",
    food?.name ?? "(deleted food)",
    food?.scale === "prop" ? propLabel(entry.amount) : entry.amount,
    food?.scale === "prop" ? "portion" : unitOf(food),
    hasProteinScale(food?.scale) && food.proteinPct != null ? food.proteinPct : "",
    mg == null ? "" : round2(mg),
    entry.note || "",
    entry.by || "",
  ];
}

// --- Codes & storage -----------------------------------------------------------

export const normaliseCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function randomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/I/L)
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  return "TOL" + Array.from({ length: 6 }, pick).join("");
}

export const storage = {
  get(key) {
    try { return localStorage.getItem("tol." + key); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value == null || value === "") localStorage.removeItem("tol." + key);
      else localStorage.setItem("tol." + key, value);
    } catch { /* storage unavailable; the app still works for this session */ }
  },
  getJson(key, fallback) {
    try { return JSON.parse(storage.get(key)) ?? fallback; } catch { return fallback; }
  },
  setJson(key, value) {
    storage.set(key, JSON.stringify(value));
  },
};

// Amount as stored: 2 decimal places, except proportions (⅓ must stay exact).
export const cleanAmount = (food, value) => (food?.scale === "prop" ? value : round2(value));
