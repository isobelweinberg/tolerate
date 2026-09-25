// The "Foods" tab: every food for this allergen, with edit and (when unused) delete.

import { html, useState } from "./lib.js";
import { Sheet, ConfirmButton } from "./ui.js";
import { FoodForm } from "./log.js";
import { formatAmount, formatDay, scaleDescription, trimNum } from "./util.js";

export function FoodsPanel({ allergen, foods, entries, act }) {
  const [editing, setEditing] = useState(null); // a food, or "new"

  return html`
    <div class="foods">
      ${!foods.length && html`<div class="card empty"><p class="muted">No foods yet.</p></div>`}
      ${[...foods].reverse().map((f) => {
        const given = entries.filter((e) => e.foodId === f.id);
        const last = given[0];
        return html`
          <div class="card food-card" key=${f.id}>
            <div class="food-top">
              <h3>${f.name}</h3>
              <button class="btn ghost small" onClick=${() => setEditing(f)}>Edit</button>
            </div>
            <p class="muted small">
              ${scaleDescription(f)}
              ${f.scale === "g" && f.proteinPct != null && html` · <strong class="pink">${trimNum(f.proteinPct, 3)}% protein</strong>`}
            </p>
            <p class="small">
              ${given.length
                ? html`Given ${given.length} ${given.length === 1 ? "time" : "times"} · last ${formatDay(last.date).toLowerCase()}, ${formatAmount(f, last.amount)}`
                : html`<span class="muted">Not given yet</span>`}
            </p>
            ${given.length === 0
              ? html`<${ConfirmButton} label="Delete food" confirmLabel="Tap again to delete" class="btn danger-ghost small"
                  onConfirm=${() => act.removeMany([{ col: "foods", id: f.id }])} />`
              : html`<p class="muted tiny">To delete this food, first delete its ${given.length} ${given.length === 1 ? "entry" : "entries"} from History.</p>`}
          </div>`;
      })}
      <button class="btn outline wide" onClick=${() => setEditing("new")}>+ Add a food</button>
    </div>

    ${editing && html`
      <${Sheet} title=${editing === "new" ? "New food" : "Edit food"} onClose=${() => setEditing(null)}>
        <${FoodForm} allergen=${allergen} food=${editing === "new" ? null : editing} act=${act} onDone=${() => setEditing(null)} />
      <//>`}`;
}
