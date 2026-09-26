// The "Log" tab: record a dose now. Also the food form and food picker used elsewhere.

import { html, useState, useEffect, useRef } from "./lib.js";
import { Sheet, AmountInput, ScalePicker } from "./ui.js";
import { defaultFoodId, lastAmountText } from "./model.js";
import {
  dayKey, timeKey, formatDay, formatAmount, cleanAmount, formatMg, parseNum, proteinMg, scaleDescription, trimNum,
  hasProteinScale, per100,
} from "./util.js";

export function LogPanel({ allergen, foods, entries, act, name, toast, openBulk }) {
  const [foodId, setFoodId] = useState(() => defaultFoodId(foods, entries));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [addingFood, setAddingFood] = useState(false);
  const justAdded = useRef(null); // a new food we've picked before it shows up in `foods`
  const food = foods.find((f) => f.id === foodId);
  const pickNew = (id) => { justAdded.current = id; setFoodId(id); };

  // If the chosen food disappears (or foods arrive later), fall back to the default.
  useEffect(() => {
    if (food) justAdded.current = null;
    else if (foodId !== justAdded.current) setFoodId(defaultFoodId(foods, entries));
  }, [foods, food]);

  // Prefill with the last amount given of this food.
  useEffect(() => {
    setAmount(lastAmountText(entries, food));
  }, [foodId, !!food]);

  const value = parseNum(amount);
  const valid = food && value != null && value > 0;
  const mg = valid ? proteinMg(food, value) : null;
  const last = entries[0];
  const lastFood = last && foods.find((f) => f.id === last.foodId);

  const save = () => {
    if (!valid) return;
    const id = act.add("entries", {
      allergenId: allergen.id,
      foodId,
      amount: cleanAmount(food, value),
      date: dayKey(),
      time: timeKey(),
      note: note.trim() || null,
      by: name || null,
      clientTime: Date.now(),
    });
    setNote("");
    toast(`Saved: ${formatAmount(food, value)} ${food.name}`, {
      label: "Undo",
      run: () => act.removeMany([{ col: "entries", id }]),
    });
  };

  if (!foods.length) {
    return html`
      <div class="card empty">
        <h3>Add a first food</h3>
        <${FoodForm} allergen=${allergen} act=${act} onDone=${pickNew} inline />
      </div>`;
  }

  return html`
    <div class="card log-card">
      <div class="field">
        <span class="label">Food</span>
        <div class="row gap">
          <${FoodSelect} foods=${foods} value=${foodId} onChange=${setFoodId} />
          <button class="btn ghost small nowrap" onClick=${() => setAddingFood(true)}>+ New</button>
        </div>
        ${food && html`<span class="hint">${scaleDescription(food)}${hasProteinScale(food.scale) && food.proteinPct != null
          ? ` · ${trimNum(food.proteinPct, 3)} g ${allergen.name.toLowerCase()} protein ${per100(food.scale)}` : ""}</span>`}
      </div>

      <label class="field" for="amount">
        <span class="label">How much?</span>
      </label>
      <${AmountInput} id="amount" food=${food} value=${amount} onInput=${setAmount} />
      ${amount !== "" && value == null && html`<p class="error-text">Enter a number, like 2.5</p>`}

      ${hasProteinScale(food?.scale) && food.proteinPct != null && html`
        <div class=${"protein" + (mg == null ? " dim" : "")}>
          <span class="protein-value">${mg == null ? "–" : formatMg(mg)}</span>
          <span class="protein-label">${allergen.name.toLowerCase()} protein</span>
        </div>`}

      <label class="field">
        <span class="label">Any reaction? <span class="muted">(optional)</span></span>
        <textarea rows="2" value=${note} placeholder="e.g. a few hives around the mouth after 10 min"
          onInput=${(e) => setNote(e.target.value)} />
      </label>

      <button class="btn primary big wide" disabled=${!valid} onClick=${save}>Save entry</button>
    </div>

    ${last && html`<p class="last-given">
      ${last.note && html`<${WarningIcon} title=${`Reaction noted: ${last.note}`} />${" "}`}Last given <strong>${formatDay(last.date).toLowerCase()}${last.time ? ` at ${last.time}` : ""}</strong>:
      ${" "}${formatAmount(lastFood, last.amount)} ${lastFood?.name}
      ${proteinMg(lastFood, last.amount) != null ? ` (${formatMg(proteinMg(lastFood, last.amount))})` : ""}
    </p>`}

    <button class="btn outline wide" onClick=${openBulk}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M4 12h10M4 18h10M18 9v6M15 12h6" /></svg>
      Bulk add past entries
    </button>

    ${addingFood && html`
      <${Sheet} title="New food" onClose=${() => setAddingFood(false)}>
        <${FoodForm} allergen=${allergen} act=${act} onDone=${(id) => { pickNew(id); setAddingFood(false); }} />
      <//>`}`;
}

// Amber triangle with "!", shown where a dose had a reaction noted.
export const WarningIcon = ({ title }) => html`
  <svg class="warn-icon" width="17" height="17" viewBox="0 0 24 24" role="img" aria-label=${title}>
    <title>${title}</title>
    <path d="M10.3 3.9L2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" fill="currentColor" />
    <path d="M12 9v4.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="12" cy="17" r="1.25" fill="#fff" />
  </svg>`;

export function FoodSelect({ foods, value, onChange }) {
  return html`<select class="select grow" value=${value || ""} onChange=${(e) => onChange(e.target.value)}>
    ${foods.map((f) => html`<option value=${f.id}>${f.name}</option>`)}
  </select>`;
}

// Add a food, or edit one (name and protein content only: the scale is fixed once created).
// Protein is grams of allergen protein per 100 g or 100 ml (stored as `proteinPct`).
export function FoodForm({ allergen, food, act, onDone, inline = false }) {
  const [name, setName] = useState(food?.name ?? "");
  const [scale, setScale] = useState(food?.scale ?? "g");
  const [unit, setUnit] = useState(food?.unit ?? "");
  const [pct, setPct] = useState(food?.proteinPct != null ? String(food.proteinPct) : "");
  const pctValue = parseNum(pct);
  const pctBad = pct.trim() !== "" && (pctValue == null || pctValue > 100);
  const ok = name.trim() && !pctBad && (scale !== "custom" || unit.trim());

  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    const proteinPct = hasProteinScale(scale) && pctValue != null ? pctValue : null;
    if (food) {
      act.update("foods", food.id, { name: name.trim(), proteinPct });
      onDone(food.id);
    } else {
      const id = act.add("foods", {
        allergenId: allergen.id,
        name: name.trim(),
        scale,
        unit: scale === "custom" ? unit.trim() : null,
        proteinPct,
        createdAt: Date.now(),
      });
      onDone(id);
    }
  };

  return html`
    <form class=${"food-form" + (inline ? " inline" : "")} onSubmit=${submit}>
      <label class="field">
        <span class="label">Name</span>
        <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${allergen.name.toLowerCase() === "egg" ? "e.g. croissant" : "e.g. tahini 1:9 with purée"} />
      </label>
      <div class="field">
        <span class="label">Measured in</span>
        ${food
          ? html`<p class="static">${scaleDescription(food)} <span class="muted small">(can't be changed)</span></p>`
          : html`<${ScalePicker} value=${scale} onChange=${setScale} />`}
      </div>
      ${!food && scale === "custom" && html`
        <label class="field">
          <span class="label">Unit name</span>
          <input value=${unit} onInput=${(e) => setUnit(e.target.value)} placeholder="e.g. biscuits, drops, sachets" />
        </label>`}
      ${hasProteinScale(scale) && html`
        <label class="field">
          <span class="label">${allergen.name} protein ${per100(scale)} <span class="muted">(optional)</span></span>
          <div class="amount-input">
            <input type="text" inputmode="decimal" value=${pct} onInput=${(e) => setPct(e.target.value)} placeholder=${scale === "ml" ? "e.g. 3.4" : "e.g. 2.5"} />
            <span class="unit">g</span>
          </div>
          ${pctBad && html`<span class="error-text">Enter an amount between 0 and 100 g</span>`}
          <span class="hint">Used to work out mg of ${allergen.name.toLowerCase()} protein per dose.${food ? " Changing it updates past entries too." : ""}</span>
        </label>`}
      <button class="btn primary" type="submit" disabled=${!ok}>${food ? "Save changes" : "Add food"}</button>
    </form>`;
}
