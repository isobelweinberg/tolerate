// Bulk add: several past entries at once, each with a date (no time).

import { html, useState } from "./lib.js";
import { Sheet, AmountInput, Calendar, closeIcon } from "./ui.js";
import { FoodSelect } from "./log.js";
import { defaultFoodId, lastAmountText } from "./model.js";
import { cleanAmount, formatDay, formatMg, parseNum, proteinMg } from "./util.js";

let nextRow = 0;
const blankRow = (foodId) => ({ key: nextRow++, date: "", foodId, amount: "", note: "" });

export function BulkAdd({ allergen, foods, entries, act, name, toast, onClose }) {
  const firstFood = defaultFoodId(foods, entries);
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => blankRow(firstFood)));
  const [picking, setPicking] = useState(null); // index of the row choosing a date
  const [tried, setTried] = useState(false);

  const change = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const foodOf = (r) => foods.find((f) => f.id === r.foodId);

  const isBlank = (r) => !r.date && r.amount.trim() === "" && !r.note.trim();
  const problem = (r) => {
    if (isBlank(r)) return null;
    if (!r.date) return "Pick a date";
    const v = parseNum(r.amount);
    if (v == null || v <= 0) return "Enter an amount";
    return null;
  };
  const filled = rows.filter((r) => !isBlank(r));
  const problems = rows.map(problem);
  const canAdd = filled.length > 0 && problems.every((p) => !p);

  // The calendar opens on the nearest date above this line (or this line's own).
  const calendarStart = (i) => {
    for (let j = i - 1; j >= 0; j--) if (rows[j].date) return rows[j].date;
    return undefined;
  };

  const addAll = () => {
    setTried(true);
    if (!canAdd) return;
    const now = Date.now();
    filled.forEach((r, i) => {
      const food = foodOf(r);
      act.add("entries", {
        allergenId: allergen.id,
        foodId: r.foodId,
        amount: cleanAmount(food, parseNum(r.amount)),
        date: r.date,
        time: null,
        note: r.note.trim() || null,
        by: name || null,
        clientTime: now + i,
      });
    });
    toast(`Added ${filled.length} ${filled.length === 1 ? "entry" : "entries"} to ${allergen.name}`);
    onClose();
  };

  return html`
    <${Sheet} title=${`Bulk add · ${allergen.name}`} onClose=${onClose} wide>
      <p class="muted small">Fill in as many lines as you need. Blank lines are skipped.</p>
      <ol class="bulk-rows">
        ${rows.map((r, i) => {
          const food = foodOf(r);
          const v = parseNum(r.amount);
          const mg = v ? proteinMg(food, v) : null;
          const err = tried && problems[i];
          return html`
            <li class=${"bulk-row card" + (err ? " has-error" : "")} key=${r.key}>
              <div class="row gap">
                <button class=${"select date-btn" + (r.date ? "" : " placeholder")} onClick=${() => setPicking(i)}>
                  ${r.date ? formatDay(r.date, { relative: false }) : "Date"}
                </button>
                <${FoodSelect} foods=${foods} value=${r.foodId}
                  onChange=${(id) => change(i, { foodId: id, amount: foodOf({ foodId: id })?.scale === food?.scale ? r.amount : "" })} />
                ${rows.length > 1 && html`<button class="icon-btn small" aria-label="Remove line"
                  onClick=${() => setRows((rs) => rs.filter((_, j) => j !== i))}>${closeIcon()}</button>`}
              </div>
              <${AmountInput} food=${food} value=${r.amount} compact
                placeholder=${lastAmountText(entries, food) || "Amount"}
                onInput=${(a) => change(i, { amount: a })} />
              ${mg != null && html`<span class="hint strong-pink">${formatMg(mg)} protein</span>`}
              <input class="note-input" value=${r.note} placeholder="Reaction (optional)"
                onInput=${(e) => change(i, { note: e.target.value })} />
              ${err && html`<span class="error-text">${err}</span>`}
            </li>`;
        })}
      </ol>
      <button class="btn ghost wide" onClick=${() => setRows((rs) => [...rs, blankRow(firstFood)])}>+ Add another line</button>
      <div class="sticky-foot">
        <button class="btn primary big wide" disabled=${!filled.length} onClick=${addAll}>
          ${filled.length ? `Add ${filled.length} ${filled.length === 1 ? "entry" : "entries"}` : "Add all"}
        </button>
      </div>
    <//>
    ${picking != null && html`<${Calendar} value=${rows[picking].date} initial=${calendarStart(picking)}
      onClose=${() => setPicking(null)} onPick=${(d) => { change(picking, { date: d }); setPicking(null); }} />`}`;
}
