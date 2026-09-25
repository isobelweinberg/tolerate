// A small library of allergen icons, drawn in code on a 32×32 grid.
// Outlines use the text colour; shapes with class "f" get a soft tint of it,
// and "s" shapes are solid.

import { html } from "./lib.js";

// Kiwi seeds: a ring of little dots around the core.
const kiwiSeeds = () => Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return html`<circle class="s" cx=${(16 + Math.cos(a) * 5.6).toFixed(2)} cy=${(16 + Math.sin(a) * 5.6).toFixed(2)} r="0.75" />`;
});

// One sesame seed, point up, centred on 0,0.
const seed = (transform) => html`
  <g transform=${transform}>
    <path class="f" d="M0-6.2c2.3 1.2 3.6 3.6 3.6 6.3S2 6 0 6-3.6 2.8-3.6.1-2.3-5 0-6.2z" />
    <path d="M-1.2-2.2c-.2 1.2-.1 2.4.3 3.4" />
  </g>`;

// A pair of wheat grains either side of the stalk.
const grains = (y) => html`
  <g transform=${`translate(0 ${y})`}>
    <path class="f" d="M16 13c-3.2 0-4.8-2-5.2-4.4 3.2 0 4.8 2 5.2 4.4z" />
    <path class="f" d="M16 13c3.2 0 4.8-2 5.2-4.4-3.2 0-4.8 2-5.2 4.4z" />
  </g>`;

export const ICONS = [
  {
    id: "peanut", label: "Peanut", words: ["peanut", "groundnut", "arachis"],
    draw: () => html`
      <g transform="rotate(-35 16 16)">
        <path class="f" d="M16 3.5c-3.6 0-6 2.7-6 6 0 2.3 1.2 3.6 1.2 6.5S9.5 19.6 9.5 22.5c0 3.4 2.9 6 6.5 6s6.5-2.6 6.5-6c0-2.9-1.7-3.6-1.7-6.5s1.2-4.2 1.2-6.5c0-3.3-2.4-6-6-6z" />
        <path d="M13.6 8.2l1.6 1.2M17.2 7.4l1.2 1.3M13.4 21.4l1.7 1.2M17.6 20.4l1.2 1.4M14.2 25.3l1.4-.9M17.8 24.8l.9-1.3M11.8 16h8.4" />
      </g>`,
  },
  {
    id: "walnut", label: "Walnut", words: ["walnut", "pecan"],
    draw: () => html`
      <path class="f" d="M16 4.5c-6.2 0-10.5 5-10.5 11.8S9.8 28 16 28s10.5-4.9 10.5-11.7S22.2 4.5 16 4.5z" />
      <path d="M16 4.5V28M16 4.5V2.8M11.2 9c1.5 2 1.4 4.3-.6 6.2M8.6 18.5c2.2 0 3.7 1.7 3.6 4.2M20.8 9c-1.5 2-1.4 4.3.6 6.2M23.4 18.5c-2.2 0-3.7 1.7-3.6 4.2" />`,
  },
  {
    id: "sesame", label: "Sesame", words: ["sesame", "tahini", "halva", "hummus"],
    draw: () => html`
      ${seed("translate(10.5 19) rotate(-28)")}
      ${seed("translate(20.5 11.5) rotate(22)")}
      ${seed("translate(21 23.5) rotate(72) scale(.9)")}`,
  },
  {
    id: "egg", label: "Egg", words: ["egg"],
    draw: () => html`
      <path class="f" d="M16 3.5c-5 0-9.5 8.2-9.5 14.5a9.5 9.5 0 0 0 19 0c0-6.3-4.5-14.5-9.5-14.5z" />
      <path d="M11.2 16c.4-2.2 1.3-4.2 2.5-5.7" />`,
  },
  {
    id: "milk", label: "Milk", words: ["milk", "dairy", "cow", "lactose", "cheese", "yoghurt", "yogurt"],
    draw: () => html`
      <path class="f" d="M9.7 16.5c2.1-1.2 4.2-1.2 6.3 0s4.2 1.2 6.3 0V26a2.5 2.5 0 0 1-2.5 2.5h-7.6A2.5 2.5 0 0 1 9.7 26z" />
      <path d="M12.5 3.5h7v3.2l2.8 4.3V26a2.5 2.5 0 0 1-2.5 2.5h-7.6A2.5 2.5 0 0 1 9.7 26V11l2.8-4.3zM12.5 6.7h7" />`,
  },
  {
    id: "wheat", label: "Wheat", words: ["wheat", "gluten", "oat", "barley", "rye", "grain", "cereal"],
    draw: () => html`
      <path d="M16 29V9" />
      <path class="f" d="M16 3.5c1.5 1.4 1.5 4 0 5.5-1.5-1.5-1.5-4.1 0-5.5z" />
      ${grains(0)}${grains(5)}${grains(10)}`,
  },
  {
    id: "soy", label: "Soya", words: ["soy", "soya", "edamame", "lupin", "pea", "chickpea", "lentil", "legume", "bean"],
    draw: () => html`
      <path class="f" d="M5 22.5c2-8 9-14 20-15 1 1 1 2.5 0 3.5-4 7.5-12 13.5-18.5 14-1.2-.4-1.8-1.3-1.5-2.5z" />
      <circle cx="10.5" cy="20" r="2.2" /><circle cx="15.5" cy="16.2" r="2.2" /><circle cx="20.4" cy="12.2" r="2.2" />
      <path d="M25 7.5l2.2-2.8" />`,
  },
  {
    id: "fish", label: "Fish", words: ["fish", "cod", "salmon", "tuna", "haddock", "sardine", "mackerel"],
    draw: () => html`
      <path class="f" d="M9 16c3-5 7.5-7.5 11.5-7.5S27 11.5 28.5 16c-1.5 4.5-4 7.5-8 7.5S12 21 9 16z" />
      <path d="M9 16l-5.5-5.5v11zM18 11.5c1.3 2.8 1.3 6.2 0 9" />
      <circle class="s" cx="23.2" cy="14.4" r="1.1" />`,
  },
  {
    id: "shellfish", label: "Shellfish", words: ["shellfish", "prawn", "shrimp", "crab", "lobster", "scallop", "mussel", "oyster", "clam", "crustacean", "mollusc"],
    draw: () => html`
      <path class="f" d="M16 26.5L4.8 12.5C6.8 7.5 11 4.5 16 4.5s9.2 3 11.2 8z" />
      <path d="M16 26.5L9.2 7.3M16 26.5l-3.4-21.4M16 26.5v-22M16 26.5l3.4-21.4M16 26.5l6.8-19.2M12.8 26.5h6.4l-1 2.5h-4.4z" />`,
  },
  {
    id: "cashew", label: "Cashew", words: ["cashew"],
    draw: () => html`
      <path class="f" d="M22.5 5.5c-6.5-1.5-14 3-15.5 10.5-1.3 6.5 2.5 11.5 8 11.5 2.5 0 3.5-2 2.3-3.8-2.8-4-.8-9.8 5-11 2.4-.5 3.2-2.3 2.6-4.3-.4-1.5-1.2-2.5-2.4-2.9z" />
      <path d="M10.8 14c.8-2.4 2.6-4.3 5-5.2" />`,
  },
  {
    id: "hazelnut", label: "Hazelnut", words: ["hazelnut", "hazel", "filbert", "nutella"],
    draw: () => html`
      <path class="f" d="M6.5 15.5c0 7.2 4.5 13 9.5 13s9.5-5.8 9.5-13z" />
      <path d="M5.8 15.5c0-5.2 4.5-9.3 10.2-9.3s10.2 4.1 10.2 9.3zM16 6.2V3.2M10.5 11.5l1 1.3M15.5 10.2v1.6M20.5 11.3l-1 1.4M12.5 20.5c.3 2 1.2 3.7 2.5 4.8" />`,
  },
  {
    id: "almond", label: "Almond", words: ["almond", "marzipan", "frangipane"],
    draw: () => html`
      <g transform="rotate(28 16 16)">
        <path class="f" d="M16 3.5c-4.5 4-7 9-7 14.5 0 5.5 3 9.5 7 9.5s7-4 7-9.5C23 12.5 20.5 7.5 16 3.5z" />
        <path d="M14 12.2l1 1M17.6 15.2l1 1M13.6 19.2l1 1M17.4 22.2l1 1" />
      </g>`,
  },
  {
    id: "pistachio", label: "Pistachio", words: ["pistachio"],
    draw: () => html`
      <g transform="rotate(30 16 16)">
        <path class="f" d="M16 3.8c-5.2 0-8.5 5.5-8.5 12.2s3.3 12.2 8.5 12.2 8.5-5.5 8.5-12.2S21.2 3.8 16 3.8z" />
        <path class="s" style="opacity:.35" d="M16.6 7.5c2.6 1.8 3.9 5 3.9 8.5s-1.3 6.7-3.9 8.5c-1.5-2.6-2.1-5.4-2.1-8.5s.6-5.9 2.1-8.5z" />
        <path d="M16.6 7.5c-1.5 2.6-2.1 5.4-2.1 8.5s.6 5.9 2.1 8.5" />
      </g>`,
  },
  {
    id: "mustard", label: "Mustard", words: ["mustard", "seed", "sunflower", "poppy"],
    draw: () => html`
      <circle class="f" cx="11" cy="11.5" r="4" /><circle class="f" cx="20.8" cy="10" r="3.6" />
      <circle class="f" cx="15.5" cy="20.5" r="4" /><circle class="f" cx="24" cy="19.5" r="3" /><circle class="f" cx="8.5" cy="23" r="2.7" />
      <path d="M9.6 10c.6-.8 1.4-1.1 2.2-1.1M19.6 8.8c.5-.6 1.2-.9 1.9-.9M14 19c.6-.8 1.4-1.1 2.2-1.1" />`,
  },
  {
    id: "kiwi", label: "Kiwi", words: ["kiwi"],
    draw: () => html`
      <circle class="f" cx="16" cy="16" r="12" /><circle cx="16" cy="16" r="8.8" />
      <ellipse cx="16" cy="16" rx="2.8" ry="2.2" />${kiwiSeeds()}`,
  },
  {
    id: "nut", label: "Tree nut", words: ["nut", "brazil", "macadamia", "pine", "chestnut", "coconut", "acorn"],
    draw: () => html`
      <path class="f" d="M8 13.5c0 7 3.5 12.3 8 15 4.5-2.7 8-8 8-15z" />
      <path d="M5.8 13.5c0-4.6 4.6-7.5 10.2-7.5s10.2 2.9 10.2 7.5zM16 6V3M10 10.5h2M15 9.5h2M20 10.5h2" />`,
  },
  {
    id: "other", label: "Other", words: [],
    draw: () => html`
      <path class="f" d="M16 4l3.2 7.8 8.3.7-6.3 5.5 1.9 8.2L16 21.8l-7.1 4.4 1.9-8.2-6.3-5.5 8.3-.7z" />`,
  },
];

const byId = Object.fromEntries(ICONS.map((i) => [i.id, i]));

// Best icon for an allergen name, e.g. "Tahini" -> sesame. Null if nothing fits.
export function suggestIcon(name) {
  const n = name.toLowerCase();
  if (!n.trim()) return null;
  return ICONS.find((i) => i.words.some((w) => n.includes(w)))?.id ?? null;
}

export function Icon({ id, size = 24, class: cls = "" }) {
  const icon = byId[id];
  if (!icon) return null;
  return html`
    <svg class=${"icon " + cls} width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      ${icon.draw()}
    </svg>`;
}

// Used where an allergen has no icon: its first letter in a circle.
export function AllergenBadge({ allergen, size = 24 }) {
  if (allergen.icon && byId[allergen.icon]) return html`<${Icon} id=${allergen.icon} size=${size} />`;
  return html`<span class="letter-badge" style=${`width:${size}px;height:${size}px;font-size:${size * 0.5}px`}>
    ${(allergen.name || "?").trim().charAt(0).toUpperCase()}
  </span>`;
}
