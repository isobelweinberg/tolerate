// Reusable bits of interface: sheets, confirmations, the calendar, inputs, toasts.

import { html, useState, useEffect, useRef } from "./lib.js";
import { PROPORTIONS, SCALES, dayKey, parseDay, unitOf } from "./util.js";

// Open sheets, top last: Escape closes only the top one, and the page behind
// stays still while any are open.
const openSheets = [];

// A panel that slides up from the bottom. Tap outside or press Escape to close.
export function Sheet({ title, onClose, children, wide = false }) {
  const closer = useRef(onClose);
  closer.current = onClose;
  useEffect(() => {
    const me = () => closer.current();
    openSheets.push(me);
    document.body.classList.add("no-scroll");
    return () => {
      openSheets.splice(openSheets.indexOf(me), 1);
      if (!openSheets.length) document.body.classList.remove("no-scroll");
    };
  }, []);
  return html`
    <div class="backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class=${"sheet" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label=${title}>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${onClose} aria-label="Close">${closeIcon()}</button>
        </div>
        <div class="sheet-body">${children}</div>
      </div>
    </div>`;
}

export const closeIcon = () => html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>`;

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openSheets.length) openSheets[openSheets.length - 1]();
});

// A delete that needs the name typing first, for things that take lots of data with them.
export function StrongDelete({ what, name, detail, onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return html`
    <${Sheet} title=${`Delete ${what}?`} onClose=${onClose}>
      <div class="warning-box">
        <strong>This can't be undone.</strong>
        <p>${detail}</p>
        <p>It will be removed for everyone using this share code.</p>
      </div>
      <label class="field">
        <span>Type <strong>${name}</strong> to confirm</span>
        <input value=${typed} onInput=${(e) => setTyped(e.target.value)} autocomplete="off" />
      </label>
      <div class="row gap">
        <button class="btn ghost" onClick=${onClose}>Cancel</button>
        <button class="btn danger grow" disabled=${!matches} onClick=${onConfirm}>Delete ${what}</button>
      </div>
    <//>`;
}

// A button that asks "Sure?" on the first tap and acts on the second.
export function ConfirmButton({ label, confirmLabel = "Tap again to confirm", class: cls = "btn danger-ghost", onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button class=${cls + (armed ? " armed" : "")} onClick=${() => (armed ? onConfirm() : setArmed(true))}>
    ${armed ? confirmLabel : label}
  </button>`;
}

export function Segmented({ options, value, onChange, small = false }) {
  return html`<div class=${"segmented" + (small ? " small" : "")} role="radiogroup">
    ${options.map((o) => html`
      <button type="button" role="radio" aria-checked=${o.id === value} class=${o.id === value ? "on" : ""}
        onClick=${() => onChange(o.id)}>${o.label}</button>`)}
  </div>`;
}

export const ScalePicker = ({ value, onChange }) =>
  html`<${Segmented} options=${SCALES} value=${value} onChange=${onChange} small />`;

// Amount entry that fits the food's scale. `value` is the text typed (or, for
// proportions, the chosen number as text).
export function AmountInput({ food, value, onInput, placeholder, id, compact = false }) {
  if (food?.scale === "prop") {
    return html`<div class=${"prop-grid" + (compact ? " compact" : "")}>
      ${PROPORTIONS.map((p) => {
        const on = value !== "" && Math.abs(Number(value) - p.value) < 1e-6;
        return html`<button type="button" class=${"prop" + (on ? " on" : "")} aria-pressed=${on}
          onClick=${() => onInput(on ? "" : String(p.value))}>${p.label}</button>`;
      })}
    </div>`;
  }
  const unit = unitOf(food);
  return html`<div class="amount-input">
    <input id=${id} type="text" inputmode="decimal" autocomplete="off" value=${value} placeholder=${placeholder || "0"}
      onInput=${(e) => onInput(e.target.value)} />
    ${unit && html`<span class="unit">${unit}</span>`}
  </div>`;
}

// --- Calendar --------------------------------------------------------------------

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Month grid for picking a past date. Opens on `initial` (a date key).
export function Calendar({ value, initial, onPick, onClose }) {
  const today = dayKey();
  const start = parseDay(value || initial || today);
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const move = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const thisMonth = new Date(); thisMonth.setDate(1);
  const atEnd = month.getFullYear() === thisMonth.getFullYear() && month.getMonth() === thisMonth.getMonth();

  const lead = (month.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);

  return html`
    <${Sheet} title="Pick a date" onClose=${onClose}>
      <div class="calendar">
        <div class="cal-head">
          <button class="icon-btn" onClick=${() => move(-1)} aria-label="Previous month">‹</button>
          <strong>${month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</strong>
          <button class="icon-btn" onClick=${() => move(1)} disabled=${atEnd} aria-label="Next month">›</button>
        </div>
        <div class="cal-grid">
          ${WEEKDAYS.map((d) => html`<span class="cal-dow">${d}</span>`)}
          ${cells.map((key) => key
            ? html`<button class=${"cal-day" + (key === value ? " on" : "") + (key === today ? " today" : "")
                + (key === initial && key !== value ? " hint" : "")}
                disabled=${key > today} onClick=${() => onPick(key)}>${Number(key.slice(8))}</button>`
            : html`<span />`)}
        </div>
        <div class="row gap">
          <button class="btn ghost small grow" onClick=${() => onPick(dayKey(yesterday))}>Yesterday</button>
          <button class="btn ghost small grow" onClick=${() => onPick(today)}>Today</button>
        </div>
      </div>
    <//>`;
}

// --- Toasts ------------------------------------------------------------------------

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = (message, action) => {
    clearTimeout(timer.current);
    setToast({ message, action, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 3000);
  };
  const view = toast && html`
    <div class="toast" key=${toast.id} role="status">
      <span>${toast.message}</span>
      ${toast.action && html`<button onClick=${() => { toast.action.run(); setToast(null); }}>${toast.action.label}</button>`}
    </div>`;
  return [view, show];
}

// Focuses an input when a sheet opens (the autofocus attribute only works on page load).
export function useFocus(enabled = true) {
  const ref = useRef();
  useEffect(() => {
    if (enabled) setTimeout(() => ref.current?.focus(), 60);
  }, []);
  return ref;
}
