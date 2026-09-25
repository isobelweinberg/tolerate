import { html, render, useState, useEffect, useMemo, useCallback } from "./lib.js";
import { ready, household, LOCAL_MODE } from "./db.js";
import { useSheetSync } from "./sync.js";
import { foodsOf, entriesOf, allergensOf } from "./model.js";
import { normaliseCode, randomCode, storage } from "./util.js";
import { AllergenBadge } from "./icons.js";
import { AllergenForm, Tick } from "./allergens.js";
import { LogPanel } from "./log.js";
import { HistoryPanel } from "./history.js";
import { FoodsPanel } from "./foods.js";
import { BulkAdd } from "./bulk.js";
import { SettingsScreen, ChildForm } from "./settings.js";
import { Sheet, Segmented, useToast } from "./ui.js";

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

function App() {
  const [code, setCode] = useState(() => storage.get("code"));
  const [name, setName] = useState(() => storage.get("name") || "");

  const join = (newCode, newName) => {
    storage.set("code", newCode);
    storage.set("name", newName);
    setName(newName);
    setCode(newCode);
  };
  const leave = () => {
    storage.set("code", null);
    setCode(null);
  };
  const rename = (newName) => {
    storage.set("name", newName);
    setName(newName);
  };

  if (!code) return html`<${Pairing} initialName=${name} onJoin=${join} />`;
  return html`<${Household} key=${code} code=${code} name=${name} onLeave=${leave} onRename=${rename} />`;
}

const Logo = ({ big = false }) => html`<span class=${"logo" + (big ? " big" : "")}>Toler<span>ATE</span></span>`;

function Pairing({ initialName, onJoin }) {
  const [mode, setMode] = useState("new");
  const [code, setCode] = useState("");
  const [name, setName] = useState(initialName);
  const clean = normaliseCode(code);
  const ok = mode === "new" || clean.length >= 6;

  const submit = (e) => {
    e.preventDefault();
    if (ok) onJoin(mode === "new" ? randomCode() : clean, name.trim());
  };

  return html`
    <div class="pairing">
      <div class="pairing-hero">
        <${Logo} big />
        <p>Track allergen desensitisation</p>
      </div>
      <form class="card" onSubmit=${submit}>
        <${Segmented} options=${[{ id: "new", label: "Start new" }, { id: "join", label: "I have a code" }]} value=${mode} onChange=${setMode} />
        ${mode === "join" && html`
          <label class="field">
            <span class="label">Share code</span>
            <input value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="TOL…" autocapitalize="characters" autocomplete="off" />
          </label>`}
        <label class="field">
          <span class="label">Your name <span class="muted">(optional)</span></span>
          <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Mum" />
        </label>
        <button class="btn primary big wide" type="submit" disabled=${!ok}>${mode === "new" ? "Get started" : "Join"}</button>
        <p class="muted small center">${mode === "new"
          ? "You'll get a share code to enter on other phones."
          : "Ask whoever set it up for the code (in their Settings)."}</p>
        ${LOCAL_MODE && html`<p class="muted tiny center">Local mode: Firebase isn't set up yet, so data stays in this browser.</p>`}
      </form>
    </div>`;
}

// ---------------------------------------------------------------------------
// A household: all the data for one share code
// ---------------------------------------------------------------------------

function Household({ code, name, onLeave, onRename }) {
  const hh = useMemo(() => household(code), [code]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toastView, toast] = useToast();
  const sync = useSheetSync(code, data, name);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    ready.then(() => { if (!cancelled) unsub = hh.watch(setData, setError); }).catch(setError);
    return () => { cancelled = true; unsub(); };
  }, [hh]);

  // Every change goes through here, so the Google Sheet knows to update.
  const onError = useCallback((err) => { console.error(err); toast("Couldn't save: " + (err.message || err)); }, []);
  const act = useMemo(() => ({
    add: (col, value) => { sync.markDirty(); return hh.add(col, value, onError); },
    update: (col, id, patch) => { sync.markDirty(); hh.update(col, id, patch, onError); },
    removeMany: (items) => { sync.markDirty(); hh.removeMany(items, onError); },
  }), [hh, sync.markDirty]);

  if (error) return html`<${ErrorScreen} error=${error} onLeave=${onLeave} />`;
  if (!data) return html`<div class="boot"><${Logo} big /></div>`;

  return html`<${Main} code=${code} name=${name} data=${data} act=${act} sync=${sync}
    toast=${toast} onLeave=${onLeave} onRename=${onRename} />${toastView}`;
}

function ErrorScreen({ error, onLeave }) {
  const denied = error?.code === "permission-denied";
  return html`
    <div class="pairing">
      <div class="card">
        <h2>Something went wrong</h2>
        <p>${denied
          ? "The database refused access. Check the Firestore rules are published (see SETUP_GUIDE.md)."
          : "Couldn't connect to the database. Check your connection and try again."}</p>
        <p class="muted small">${String(error.message || error)}</p>
        <div class="row gap">
          <button class="btn primary grow" onClick=${() => location.reload()}>Try again</button>
          <button class="btn ghost" onClick=${onLeave}>Change code</button>
        </div>
      </div>
    </div>`;
}

// The allergen last opened for each child on this phone: { childId: allergenId }.
const lastOpened = {
  get: (childId) => storage.getJson("lastAllergen", {})[childId],
  set(childId, allergenId) {
    const all = storage.getJson("lastAllergen", {});
    all[childId] = allergenId;
    storage.setJson("lastAllergen", all);
  },
};

// Lets a mouse wheel scroll the allergen strip sideways (phones just swipe).
const wheelSideways = (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
};

function Main({ code, name, data, act, sync, toast, onLeave, onRename }) {
  const [screen, setScreen] = useState("home"); // home | settings
  const [childId, setChildIdState] = useState(() => storage.get("child"));
  const [allergenId, setAllergenId] = useState(null);
  const [tab, setTab] = useState("log");
  const [sheet, setSheet] = useState(null); // "child" | "addChild" | "addAllergen" | "editAllergen" | "bulk"

  const children = [...data.children].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const child = children.find((c) => c.id === childId) || children[0];
  const setChildId = (id) => { storage.set("child", id); setChildIdState(id); setAllergenId(null); };

  const allergens = child ? allergensOf(data, child.id) : [];
  const allergen = allergens.find((a) => a.id === (allergenId ?? lastOpened.get(child?.id))) || allergens[0];

  const open = (id) => {
    lastOpened.set(child.id, id);
    setAllergenId(id);
  };

  // Keep the chosen allergen in view in the strip.
  useEffect(() => {
    document.querySelector(".chip.on")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [allergen?.id]);

  const foods = useMemo(() => (allergen ? foodsOf(data, allergen.id) : []), [data.foods, allergen?.id]);
  const entries = useMemo(() => (allergen ? entriesOf(data, allergen.id) : []), [data.entries, allergen?.id]);

  if (screen === "settings") {
    return html`<div class="shell"><${SettingsScreen} code=${code} name=${name} data=${data} act=${act} sync=${sync}
      toast=${toast} onRename=${onRename} onLeave=${onLeave} onBack=${() => setScreen("home")} /></div>`;
  }

  const closeSheet = () => setSheet(null);

  return html`
    <div class="shell">
      <header class="top">
        <div class="top-row">
          <${Logo} />
          ${child && html`
            <button class="child-pill" onClick=${() => setSheet("child")}>
              ${child.name}${children.length > 1 && html` <span aria-hidden="true">▾</span>`}
            </button>`}
          <button class="icon-btn on-blue" onClick=${() => setScreen("settings")} aria-label="Settings">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          </button>
        </div>
        ${child && html`
          <div class="strip-row">
          <nav class="strip" aria-label="Allergens" onWheel=${wheelSideways}>
            ${allergens.map((a) => html`
              <button key=${a.id} class=${"chip" + (a.id === allergen?.id ? " on" : "")} onClick=${() => open(a.id)}
                aria-current=${a.id === allergen?.id}>
                <${AllergenBadge} allergen=${a} size=${22} />
                <span>${a.name}</span>
                ${a.maintenance && html`<${Tick} size=${15} />`}
              </button>`)}
          </nav>
          <button class="chip add" onClick=${() => setSheet("addAllergen")} aria-label="Add allergen">
            <span aria-hidden="true">+</span>${!allergens.length && html`<span>Add allergen</span>`}
          </button>
          </div>`}
      </header>

      <main class="content">
        ${!child ? html`
          <div class="card empty welcome">
            <h2>Welcome!</h2>
            <p>Who are you tracking? Add your child to get started.</p>
            <button class="btn primary big wide" onClick=${() => setSheet("addChild")}>Add a child</button>
          </div>`
        : !allergen ? html`
          <div class="card empty welcome">
            <h2>Add ${child.name}'s first allergen</h2>
            <p class="muted">For example peanut, sesame or egg. You can add as many as you need.</p>
            <button class="btn primary big wide" onClick=${() => setSheet("addAllergen")}>Add an allergen</button>
          </div>`
        : html`
          <div class="allergen-head">
            <div class="allergen-title">
              <span class="big-badge"><${AllergenBadge} allergen=${allergen} size=${34} /></span>
              <h1>${allergen.name}</h1>
              ${allergen.maintenance && html`<span class="maint"><${Tick} size=${18} /> Maintenance</span>`}
            </div>
            <button class="btn ghost small" onClick=${() => setSheet("editAllergen")}>Edit</button>
          </div>
          <${Segmented} options=${[{ id: "log", label: "Log" }, { id: "history", label: "History" }, { id: "foods", label: "Foods" }]}
            value=${tab} onChange=${setTab} />
          <div class="panel">
            ${tab === "log" && html`<${LogPanel} key=${allergen.id} allergen=${allergen} foods=${foods} entries=${entries}
              act=${act} name=${name} toast=${toast} openBulk=${() => setSheet("bulk")} />`}
            ${tab === "history" && html`<${HistoryPanel} key=${allergen.id} allergen=${allergen} foods=${foods} entries=${entries} act=${act} />`}
            ${tab === "foods" && html`<${FoodsPanel} key=${allergen.id} allergen=${allergen} foods=${foods} entries=${entries} act=${act} />`}
          </div>`}
      </main>
    </div>

    ${sheet === "child" && html`
      <${Sheet} title="Switch child" onClose=${closeSheet}>
        <ul class="plain-list">
          ${children.map((c) => html`
            <li key=${c.id}><button class=${"list-btn" + (c.id === child?.id ? " on" : "")}
              onClick=${() => { setChildId(c.id); closeSheet(); }}>${c.name}</button></li>`)}
        </ul>
        <button class="btn outline wide" onClick=${() => setSheet("addChild")}>+ Add a child</button>
      <//>`}
    ${sheet === "addChild" && html`<${ChildForm} act=${act} onClose=${closeSheet} onDone=${setChildId} />`}
    ${sheet === "addAllergen" && html`<${AllergenForm} childId=${child.id} data=${data} act=${act}
      onClose=${closeSheet} onDone=${(id) => { open(id); setTab("log"); closeSheet(); }} />`}
    ${sheet === "editAllergen" && allergen && html`<${AllergenForm} allergen=${allergen} data=${data} act=${act}
      onClose=${closeSheet} onDone=${closeSheet} />`}
    ${sheet === "bulk" && allergen && html`<${BulkAdd} allergen=${allergen} foods=${foods} entries=${entries}
      act=${act} name=${name} toast=${toast} onClose=${closeSheet} />`}`;
}

render(html`<${App} />`, document.getElementById("app"));
