// The "History" tab: a protein chart (for gram-based foods) and every entry, newest first.

import { html, useState, useEffect, useRef, useMemo } from "./lib.js";
import { Sheet, AmountInput, Calendar, ConfirmButton, Segmented } from "./ui.js";
import { FoodSelect } from "./log.js";
import { amountText } from "./model.js";
import {
  cleanAmount, dayKey, formatAmount, formatDay, formatMg, parseDay, parseNum, proteinMg,
} from "./util.js";

export function HistoryPanel({ allergen, foods, entries, act }) {
  const [editing, setEditing] = useState(null);
  const foodById = useMemo(() => Object.fromEntries(foods.map((f) => [f.id, f])), [foods]);

  const days = useMemo(() => {
    const groups = [];
    for (const e of entries) {
      const last = groups[groups.length - 1];
      if (last?.date === e.date) last.entries.push(e);
      else groups.push({ date: e.date, entries: [e] });
    }
    return groups;
  }, [entries]);

  // Total allergen protein per day, oldest first, for days where it's known.
  const points = useMemo(() => days
    .map((d) => {
      const mgs = d.entries.map((e) => proteinMg(foodById[e.foodId], e.amount)).filter((mg) => mg != null);
      return mgs.length ? { date: d.date, mg: mgs.reduce((a, b) => a + b, 0) } : null;
    })
    .filter(Boolean)
    .reverse(), [days, foodById]);

  if (!entries.length) {
    return html`<div class="card empty"><h3>Nothing yet</h3><p class="muted">Entries for ${allergen.name} will appear here.</p></div>`;
  }

  return html`
    ${points.length >= 2 && html`<${ProteinChart} points=${points} allergen=${allergen} />`}

    <div class="history">
      ${days.map((d) => html`
        <section class="day" key=${d.date}>
          <h3 class="day-head">${formatDay(d.date)}</h3>
          <ul class="card list">
            ${d.entries.map((e) => {
              const food = foodById[e.foodId];
              const mg = proteinMg(food, e.amount);
              return html`
                <li key=${e.id}>
                  <button class="entry" onClick=${() => setEditing(e)}>
                    <span class="entry-main">
                      <span class="entry-food">${food?.name ?? "Deleted food"}</span>
                      <span class="entry-amount">${formatAmount(food, e.amount)}${mg != null && html` · <strong>${formatMg(mg)}</strong>`}</span>
                      ${e.note && html`<span class="entry-note">⚠ ${e.note}</span>`}
                    </span>
                    <span class="chev" aria-hidden="true">›</span>
                  </button>
                </li>`;
            })}
          </ul>
        </section>`)}
    </div>

    ${editing && html`<${EntryEditor} entry=${editing} foods=${foods} allergen=${allergen} act=${act} onClose=${() => setEditing(null)} />`}`;
}

// --- Editing an entry ------------------------------------------------------------

function EntryEditor({ entry, foods, allergen, act, onClose }) {
  const [date, setDate] = useState(entry.date);
  const [time, setTime] = useState(entry.time || "");
  const [foodId, setFoodId] = useState(entry.foodId);
  const food = foods.find((f) => f.id === foodId);
  const [amount, setAmount] = useState(amountText(foods.find((f) => f.id === entry.foodId), entry.amount));
  const [note, setNote] = useState(entry.note || "");
  const [picking, setPicking] = useState(false);

  const value = parseNum(amount);
  const valid = food && value != null && value > 0 && date;
  const mg = valid ? proteinMg(food, value) : null;

  const changeFood = (id) => {
    const next = foods.find((f) => f.id === id);
    if (next?.scale !== food?.scale || next?.unit !== food?.unit) setAmount("");
    setFoodId(id);
  };

  const save = () => {
    act.update("entries", entry.id, {
      date, time: time || null, foodId, amount: cleanAmount(food, value), note: note.trim() || null,
    });
    onClose();
  };

  return html`
    <${Sheet} title="Edit entry" onClose=${onClose}>
      <div class="row gap">
        <div class="field grow">
          <span class="label">Date</span>
          <button class="select date-btn" onClick=${() => setPicking(true)}>${formatDay(date, { relative: false })}</button>
        </div>
        <label class="field">
          <span class="label">Time</span>
          <input type="time" value=${time} onInput=${(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div class="field">
        <span class="label">Food</span>
        <${FoodSelect} foods=${foods} value=${foodId} onChange=${changeFood} />
      </div>
      <div class="field">
        <span class="label">Amount</span>
        <${AmountInput} food=${food} value=${amount} onInput=${setAmount} />
        ${mg != null && html`<span class="hint strong-pink">${formatMg(mg)} ${allergen.name.toLowerCase()} protein</span>`}
      </div>
      <label class="field">
        <span class="label">Reaction / notes</span>
        <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)} />
      </label>
      <button class="btn primary wide" disabled=${!valid} onClick=${save}>Save changes</button>
      <div class="center">
        <${ConfirmButton} label="Delete this entry" confirmLabel="Tap again to delete"
          onConfirm=${() => { act.removeMany([{ col: "entries", id: entry.id }]); onClose(); }} />
      </div>
      ${entry.by && html`<p class="muted small center">Recorded by ${entry.by}</p>`}
    <//>
    ${picking && html`<${Calendar} value=${date} onClose=${() => setPicking(false)}
      onPick=${(d) => { setDate(d); setPicking(false); }} />`}`;
}

// --- Chart -------------------------------------------------------------------------

const RANGES = [
  { id: "1m", label: "1 month", days: 31 },
  { id: "3m", label: "3 months", days: 92 },
  { id: "all", label: "All", days: Infinity },
];

// Nice round tick values from 0 up to at least `max`.
function ticks(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let i = 0; out.length < 2 || out[out.length - 1] < max; i++) out.push(Number((i * step).toPrecision(6)));
  return out;
}

function ProteinChart({ points: all, allergen }) {
  const [range, setRange] = useState("3m");
  const [hover, setHover] = useState(null);
  const [width, setWidth] = useState(320);
  const box = useRef();

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const days = RANGES.find((r) => r.id === range).days;
  const cutoff = days === Infinity ? "" : dayKey(new Date(Date.now() - days * 864e5));
  const points = all.filter((p) => p.date >= cutoff);
  const shown = points.length ? points : all.slice(-1);

  const height = 180;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const t0 = parseDay(shown[0].date).getTime();
  const t1 = Math.max(parseDay(shown[shown.length - 1].date).getTime(), t0 + 864e5);
  const yTicks = ticks(Math.max(...shown.map((p) => p.mg)));
  const yMax = yTicks[yTicks.length - 1] || 1;
  const x = (date) => pad.l + ((parseDay(date).getTime() - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const y = (mg) => pad.t + (1 - mg / yMax) * (height - pad.t - pad.b);
  const path = shown.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.mg).toFixed(1)}`).join("");
  const latest = shown[shown.length - 1];
  const active = hover ?? latest;
  const shortDate = (d) => parseDay(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = shown[0];
    for (const p of shown) if (Math.abs(x(p.date) - px) < Math.abs(x(best.date) - px)) best = p;
    setHover(best);
  };

  return html`
    <div class="card chart-card">
      <div class="chart-head">
        <div>
          <h3>${allergen.name} protein per day (mg)</h3>
          <p class="chart-readout"><strong>${formatMg(active.mg)}</strong> <span class="muted">${formatDay(active.date)}</span></p>
        </div>
        <${Segmented} options=${RANGES} value=${range} onChange=${(r) => { setRange(r); setHover(null); }} small />
      </div>
      <div ref=${box} class="chart-box">
        <svg width=${width} height=${height} role="img"
          aria-label=${`${allergen.name} protein per day, latest ${formatMg(latest.mg)}`}
          onPointerMove=${onMove} onPointerDown=${onMove} onPointerLeave=${() => setHover(null)}>
          ${yTicks.map((v) => html`
            <line class="grid" x1=${pad.l} x2=${width - pad.r} y1=${y(v)} y2=${y(v)} />
            <text class="axis" x=${pad.l - 6} y=${y(v) + 4} text-anchor="end">${v >= 1000 ? `${v / 1000}k` : v}</text>`)}
          <text class="axis" x=${pad.l} y=${height - 6} text-anchor="start">${shortDate(shown[0].date)}</text>
          ${shown.length > 1 && html`<text class="axis" x=${width - pad.r} y=${height - 6} text-anchor="end">${shortDate(latest.date)}</text>`}
          ${hover && html`<line class="crosshair" x1=${x(hover.date)} x2=${x(hover.date)} y1=${pad.t} y2=${height - pad.b} />`}
          <path class="line" d=${path} />
          ${shown.map((p) => html`<circle class=${"dot" + (p === active ? " on" : "")} cx=${x(p.date)} cy=${y(p.mg)} r=${p === active ? 5 : 3.5} />`)}
        </svg>
      </div>
      <p class="muted small">Only foods measured in grams or ml with a protein amount are included. Tap the chart to read a day.</p>
    </div>`;
}
