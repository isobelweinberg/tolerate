// Questions the screens ask of the data.

import { byNewest, trimNum } from "./util.js";

export const foodsOf = (data, allergenId) =>
  data.foods.filter((f) => f.allergenId === allergenId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

export const entriesOf = (data, allergenId) =>
  data.entries.filter((e) => e.allergenId === allergenId).sort(byNewest);

// The food to offer first: the last one given, or the newest if none given yet.
// `entries` must be newest first.
export function defaultFoodId(foods, entries) {
  const ids = new Set(foods.map((f) => f.id));
  const lastGiven = entries.find((e) => ids.has(e.foodId));
  if (lastGiven) return lastGiven.foodId;
  return foods.length ? foods[foods.length - 1].id : null;
}

// The last amount given of a food, as text for an input ("" if never given).
export function lastAmountText(entries, food) {
  if (!food) return "";
  const last = entries.find((e) => e.foodId === food.id);
  return last ? amountText(food, last.amount) : "";
}

export const amountText = (food, amount) =>
  amount == null ? "" : food?.scale === "prop" ? String(amount) : trimNum(amount);

// Allergens in the order the family has set (Settings → Allergen order).
// Ones never reordered keep the order they were added in, after the rest.
export const allergensOf = (data, childId) =>
  data.allergens
    .filter((a) => a.childId === childId)
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));

// Everything that goes when an allergen is deleted.
export function allergenCascade(data, allergenId) {
  return [
    ...data.entries.filter((e) => e.allergenId === allergenId).map((e) => ({ col: "entries", id: e.id })),
    ...data.foods.filter((f) => f.allergenId === allergenId).map((f) => ({ col: "foods", id: f.id })),
    { col: "allergens", id: allergenId },
  ];
}

export function childCascade(data, childId) {
  return [
    ...data.allergens.filter((a) => a.childId === childId).flatMap((a) => allergenCascade(data, a.id)),
    { col: "children", id: childId },
  ];
}
