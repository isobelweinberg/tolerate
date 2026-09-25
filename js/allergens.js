// Adding and editing allergens: name, icon, maintenance, delete.

import { html, useState, useEffect, useRef } from "./lib.js";
import { Sheet, StrongDelete, useFocus } from "./ui.js";
import { ICONS, Icon, AllergenBadge, suggestIcon } from "./icons.js";
import { allergenCascade } from "./model.js";

export const Tick = ({ size = 16 }) => html`
  <svg class="tick" width=${size} height=${size} viewBox="0 0 24 24" aria-label="Maintenance" role="img">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;

// Drag the handles (or use the arrow keys on them) to change the allergen order.
// `onSave` gets the ids in their new order when a drag ends.
export function ReorderList({ items, onSave }) {
  const ids = items.map((a) => a.id);
  const [order, setOrder] = useState(ids);
  const [dragging, setDragging] = useState(null);
  const list = useRef();
  useEffect(() => setOrder(ids), [ids.join()]);

  const byId = Object.fromEntries(items.map((a) => [a.id, a]));
  const shown = order.filter((id) => byId[id]);

  const finish = (next) => {
    setDragging(null);
    if (next.join() !== ids.join()) onSave(next);
  };
  const onMove = (e) => {
    if (!dragging) return;
    // The new position is the number of other rows whose middle is above the pointer.
    const rows = [...list.current.children].filter((r) => r.dataset.id !== dragging);
    const index = rows.filter((r) => {
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2 < e.clientY;
    }).length;
    const next = shown.filter((id) => id !== dragging);
    next.splice(index, 0, dragging);
    if (next.join() !== shown.join()) setOrder(next);
  };
  const onKey = (e, id) => {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    const i = shown.indexOf(id);
    if (!step || i + step < 0 || i + step >= shown.length) return;
    e.preventDefault();
    const next = [...shown];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    setOrder(next);
    finish(next);
  };

  return html`
    <ul class="reorder" ref=${list}>
      ${shown.map((id) => html`
        <li key=${id} data-id=${id} class=${dragging === id ? "dragging" : ""}>
          <${AllergenBadge} allergen=${byId[id]} size=${22} />
          <span class="grow">${byId[id].name}</span>
          ${byId[id].maintenance && html`<${Tick} size=${15} />`}
          <button class="drag-handle" aria-label=${`Move ${byId[id].name} (drag, or use the arrow keys)`}
            onPointerDown=${(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(id); }}
            onPointerMove=${onMove}
            onPointerUp=${() => finish(shown)}
            onPointerCancel=${() => finish(shown)}
            onKeyDown=${(e) => onKey(e, id)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" /><circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" /><circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" /></svg>
          </button>
        </li>`)}
    </ul>`;
}

export function AllergenForm({ allergen, childId, data, act, onDone, onClose }) {
  const [name, setName] = useState(allergen?.name ?? "");
  const [icon, setIcon] = useState(allergen?.icon ?? null);
  const [iconChosen, setIconChosen] = useState(!!allergen); // stop auto-suggesting once picked
  const [maintenance, setMaintenance] = useState(!!allergen?.maintenance);
  const [deleting, setDeleting] = useState(false);
  const input = useFocus(!allergen);

  const typeName = (value) => {
    setName(value);
    if (!iconChosen) setIcon(suggestIcon(value));
  };
  const pick = (id) => { setIcon(id); setIconChosen(true); };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (allergen) {
      act.update("allergens", allergen.id, { name: name.trim(), icon, maintenance });
      onDone(allergen.id);
    } else {
      const id = act.add("allergens", { childId, name: name.trim(), icon, maintenance, createdAt: Date.now() });
      onDone(id);
    }
  };

  if (deleting) {
    const foods = data.foods.filter((f) => f.allergenId === allergen.id).length;
    const entries = data.entries.filter((e) => e.allergenId === allergen.id).length;
    return html`<${StrongDelete} what="allergen" name=${allergen.name}
      detail=${foods || entries
        ? `Deleting ${allergen.name} also deletes its ${foods} ${foods === 1 ? "food" : "foods"} and all ${entries} history ${entries === 1 ? "entry" : "entries"}.`
        : `${allergen.name} has no foods or history yet.`}
      onClose=${() => setDeleting(false)}
      onConfirm=${() => { act.removeMany(allergenCascade(data, allergen.id)); onClose(); }} />`;
  }

  return html`
    <${Sheet} title=${allergen ? "Edit allergen" : "New allergen"} onClose=${onClose}>
      <form onSubmit=${submit}>
        <label class="field">
          <span class="label">Name</span>
          <input value=${name} onInput=${(e) => typeName(e.target.value)} placeholder="e.g. Peanut" ref=${input} />
        </label>
        <div class="field">
          <span class="label">Icon <span class="muted">(optional)</span></span>
          <div class="icon-grid">
            <button type="button" class=${"icon-choice" + (!icon ? " on" : "")} onClick=${() => pick(null)} aria-pressed=${!icon}>
              <span class="letter-badge big">${(name.trim()[0] || "A").toUpperCase()}</span>
              <span>None</span>
            </button>
            ${ICONS.map((i) => html`
              <button type="button" class=${"icon-choice" + (icon === i.id ? " on" : "")} onClick=${() => pick(i.id)} aria-pressed=${icon === i.id}>
                <${Icon} id=${i.id} size=${30} />
                <span>${i.label}</span>
              </button>`)}
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" checked=${maintenance} onChange=${(e) => setMaintenance(e.target.checked)} />
          <span class="switch" />
          <span><strong>Maintenance</strong><br /><span class="muted small">Shows a green tick. Logging works just the same.</span></span>
        </label>
        <button class="btn primary wide" type="submit" disabled=${!name.trim()}>${allergen ? "Save" : "Add allergen"}</button>
      </form>
      ${allergen && html`
        <div class="danger-zone">
          <button class="btn danger-ghost wide" onClick=${() => setDeleting(true)}>Delete ${allergen.name}…</button>
        </div>`}
    <//>`;
}
