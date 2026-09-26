// Settings: your name, the share code, children, export, the Google Sheet.

import { html, useState } from "./lib.js";
import { Sheet, StrongDelete, ConfirmButton, useFocus } from "./ui.js";
import { childCascade, allergensOf } from "./model.js";
import { ReorderList } from "./allergens.js";
import { LOCAL_MODE } from "./db.js";
import { ReminderCard } from "./reminders.js";
import { byNewest, dayKey, entryRow, ENTRY_HEADER, toCsv } from "./util.js";

export function SettingsScreen({ code, name, data, act, sync, devices, onRename, onLeave, onBack, toast }) {
  const [editingChild, setEditingChild] = useState(null); // a child, or "new"
  const [deletingChild, setDeletingChild] = useState(null);

  const exportFile = () => new File([toCsv(exportRows(data))], `tolerate-${dayKey()}.csv`, { type: "text/csv" });
  const canShareFiles = (() => {
    try { return !!navigator.canShare?.({ files: [new File([""], "t.csv", { type: "text/csv" })] }); } catch { return false; }
  })();
  const share = async () => {
    try {
      await navigator.share({ files: [exportFile()], title: "TolerATE export" });
    } catch (err) {
      if (err.name !== "AbortError") toast("Couldn't open the share menu");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(exportFile());
    const a = Object.assign(document.createElement("a"), { href: url, download: exportFile().name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast("Share code copied");
    } catch { toast(code); }
  };

  const { status } = sync;

  return html`
    <div class="settings">
      <div class="page-head">
        <button class="icon-btn" onClick=${onBack} aria-label="Back">‹</button>
        <h1>Settings</h1>
      </div>

      <section class="card">
        <h3>Your name</h3>
        <p class="muted small">Saved with each entry you record, so others can see who logged it.</p>
        <input value=${name} onChange=${(e) => onRename(e.target.value.trim())} placeholder="e.g. Mum" />
      </section>

      <${ReminderCard} code=${code} name=${name} devices=${devices} data=${data} />

      <section class="card">
        <h3>Share code</h3>
        <p class="muted small">Enter this code on another phone to see and add to the same records.</p>
        <div class="row gap">
          <code class="share-code grow">${code}</code>
          <button class="btn ghost small" onClick=${copyCode}>Copy</button>
        </div>
      </section>

      <section class="card">
        <h3>Children</h3>
        <ul class="plain-list">
          ${data.children.map((c) => html`
            <li key=${c.id} class="row gap">
              <span class="grow">${c.name}</span>
              <button class="btn ghost small" onClick=${() => setEditingChild(c)}>Rename</button>
              <button class="btn danger-ghost small" onClick=${() => setDeletingChild(c)}>Delete</button>
            </li>`)}
        </ul>
        <button class="btn outline small" onClick=${() => setEditingChild("new")}>+ Add a child</button>
      </section>

      ${data.allergens.length > 1 && html`
        <section class="card">
          <h3>Allergen order</h3>
          <p class="muted small">Drag <span aria-hidden="true">⠿</span> to change the order of the allergens along the top.</p>
          ${data.children.map((c) => {
            const items = allergensOf(data, c.id);
            return items.length > 1 && html`
              ${data.children.length > 1 && html`<h4 class="reorder-child">${c.name}</h4>`}
              <${ReorderList} key=${c.id} items=${items}
                onSave=${(ids) => ids.forEach((id, i) => {
                  if (items.find((a) => a.id === id).order !== i) act.update("allergens", id, { order: i });
                })} />`;
          })}
        </section>`}

      <section class="card">
        <h3>Export</h3>
        <p class="muted small">Everything (all children, allergens and foods) as one CSV file, with the date and time of each entry.</p>
        <div class="row gap">
          ${canShareFiles && html`<button class="btn primary grow" onClick=${share} disabled=${!data.entries.length}>Share…</button>`}
          <button class=${"btn grow " + (canShareFiles ? "outline" : "primary")} onClick=${download} disabled=${!data.entries.length}>Download</button>
        </div>
      </section>

      <section class="card">
        <h3>Google Sheet</h3>
        ${LOCAL_MODE
          ? html`<p class="muted small">Not available while running locally.</p>`
          : !status.enabled
            ? html`<p class="muted small">Not set up for this share code. See SETUP_GUIDE.md.</p>`
            : html`
              <p class="small">
                ${status.state === "syncing" ? "Updating…"
                  : status.state === "error" ? html`<span class="error-text">${status.error}</span>`
                  : status.at ? `Up to date (${new Date(status.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})`
                  : "Updates automatically after each change."}
              </p>
              <div class="row gap">
                <a class="btn outline grow" href=${status.sheetUrl} target="_blank" rel="noopener">Open sheet</a>
                <button class="btn ghost grow" onClick=${sync.syncNow} disabled=${status.state === "syncing"}>Update now</button>
              </div>`}
      </section>

      <section class="card">
        <h3>Switch household</h3>
        <p class="muted small">Stop using this share code on this phone. Nothing is deleted. You can re-enter the code later.</p>
        <${ConfirmButton} label="Use a different share code" confirmLabel="Tap again to switch" class="btn danger-ghost" onConfirm=${onLeave} />
      </section>

      <p class="muted tiny center">TolerATE${LOCAL_MODE ? " · local mode (data stays on this device)" : ""}</p>
    </div>

    ${editingChild && html`<${ChildForm} child=${editingChild === "new" ? null : editingChild} act=${act}
      onClose=${() => setEditingChild(null)} />`}
    ${deletingChild && html`<${StrongDelete} what="child" name=${deletingChild.name}
      detail=${`Deleting ${deletingChild.name} also deletes all of their allergens, foods and history.`}
      onClose=${() => setDeletingChild(null)}
      onConfirm=${() => { act.removeMany(childCascade(data, deletingChild.id)); setDeletingChild(null); }} />`}`;
}

export function ChildForm({ child, act, onClose, onDone }) {
  const [name, setName] = useState(child?.name ?? "");
  const input = useFocus();
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (child) act.update("children", child.id, { name: name.trim() });
    else {
      const id = act.add("children", { name: name.trim(), createdAt: Date.now() });
      onDone?.(id);
    }
    onClose();
  };
  return html`
    <${Sheet} title=${child ? "Rename child" : "Add a child"} onClose=${onClose}>
      <form onSubmit=${submit}>
        <label class="field">
          <span class="label">Child's name</span>
          <input ref=${input} value=${name} onInput=${(e) => setName(e.target.value)} />
        </label>
        <button class="btn primary wide" type="submit" disabled=${!name.trim()}>${child ? "Save" : "Add"}</button>
      </form>
    <//>`;
}

function exportRows({ children, allergens, foods, entries }) {
  const foodById = Object.fromEntries(foods.map((f) => [f.id, f]));
  const allergenById = Object.fromEntries(allergens.map((a) => [a.id, a]));
  const childById = Object.fromEntries(children.map((c) => [c.id, c]));
  const rows = entries
    .filter((e) => allergenById[e.allergenId])
    .map((e) => {
      const a = allergenById[e.allergenId];
      return { e, a, child: childById[a.childId]?.name ?? "" };
    })
    .sort((p, q) => p.child.localeCompare(q.child) || p.a.name.localeCompare(q.a.name) || -byNewest(p.e, q.e));
  return [
    ["Child", "Allergen", "Maintenance", ...ENTRY_HEADER],
    ...rows.map(({ e, a, child }) => [child, a.name, a.maintenance ? "Yes" : "No", ...entryRow(e, foodById[e.foodId])]),
  ];
}
