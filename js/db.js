// Everything that talks to the database lives here.
//
// Data layout (all under the shared household code):
//   households/{code}/children/{id}   { name, createdAt }
//   households/{code}/allergens/{id}  { childId, name, icon, maintenance, createdAt }
//   households/{code}/foods/{id}      { allergenId, name, scale, unit, proteinPct, createdAt }
//   households/{code}/entries/{id}    { allergenId, foodId, amount, date, time, note, by, clientTime }
//   households/{code}/devices/{id}    { subscription, name, enabled, updatedAt }  <- phones with the daily reminder on
//
// Until js/firebase-config.js is filled in, the app runs in "local mode" and
// keeps everything in this browser only (handy for trying it out). Adding
// ?local to the address does the same, for testing without touching real data.

import { firebaseConfig } from "./firebase-config.js";

export const COLLECTIONS = ["children", "allergens", "foods", "entries"];

export const LOCAL_MODE = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE")
  || new URLSearchParams(location.search).has("local");

const V = "10.12.2";
const backend = LOCAL_MODE ? localBackend() : firebaseBackend();

// Resolves once we're signed in (anonymously) and ready to read and write.
export const ready = backend.then((b) => b.ready);

// The same small interface in both modes. Writes return straight away (the new
// id where relevant); they're saved locally at once and uploaded when online.
export function household(code) {
  const hh = backend.then((b) => b.household(code));
  return {
    // Calls onData({ children, allergens, foods, entries }) now and after every change.
    watch(onData, onError) {
      let unsub = () => {};
      let cancelled = false;
      hh.then((h) => { if (!cancelled) unsub = h.watch(onData, onError); }).catch(onError);
      return () => { cancelled = true; unsub(); };
    },
    add: (col, data, onError) => {
      const id = newId();
      hh.then((h) => h.set(col, id, data)).catch(onError);
      return id;
    },
    set: (col, id, data, onError) => hh.then((h) => h.set(col, id, data)).catch(onError),
    update: (col, id, patch, onError) => hh.then((h) => h.update(col, id, patch)).catch(onError),
    // items: [{ col, id }]
    removeMany: (items, onError) => hh.then((h) => h.removeMany(items)).catch(onError),
  };
}

function newId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// --- Firebase -----------------------------------------------------------------

async function firebaseBackend() {
  const [{ initializeApp }, authLib, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authLib.getAuth(app);
  // The local cache keeps the app usable offline; changes upload when back online.
  const db = fs.initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });

  // A previous sign-in is remembered, so this also works offline after the first launch.
  const ready = new Promise((resolve, reject) => {
    const unsubscribe = authLib.onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe();
        resolve(user);
      } else {
        authLib.signInAnonymously(auth).catch(reject);
      }
    });
  });

  return {
    ready,
    household(code) {
      const ref = (col, id) => fs.doc(db, "households", code, col, id);
      return {
        watch(onData, onError) {
          const data = {};
          const unsubs = COLLECTIONS.map((col) =>
            fs.onSnapshot(fs.collection(db, "households", code, col), (snap) => {
              data[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              if (COLLECTIONS.every((c) => data[c])) onData({ ...data });
            }, onError));
          return () => unsubs.forEach((u) => u());
        },
        set: (col, id, value) => fs.setDoc(ref(col, id), value),
        update: (col, id, patch) =>
          fs.updateDoc(ref(col, id), Object.fromEntries(
            Object.entries(patch).map(([k, v]) => [k, v === undefined ? fs.deleteField() : v]))),
        async removeMany(items) {
          // A batch holds up to 500 writes.
          for (let i = 0; i < items.length; i += 450) {
            const batch = fs.writeBatch(db);
            items.slice(i, i + 450).forEach(({ col, id }) => batch.delete(ref(col, id)));
            await batch.commit();
          }
        },
      };
    },
  };
}

// --- Local mode (this browser only) ------------------------------------------------

async function localBackend() {
  const listeners = new Set();
  const key = (code) => "tol.local." + code;

  return {
    ready: Promise.resolve({ uid: "local" }),
    household(code) {
      const load = () => {
        try { return JSON.parse(localStorage.getItem(key(code))) || {}; } catch { return {}; }
      };
      const snapshot = () => {
        const data = load();
        return Object.fromEntries(COLLECTIONS.map((c) =>
          [c, Object.entries(data[c] || {}).map(([id, v]) => ({ id, ...v }))]));
      };
      const save = (change) => {
        const data = load();
        change(data);
        localStorage.setItem(key(code), JSON.stringify(data));
        queueMicrotask(() => listeners.forEach((l) => l()));
      };
      return {
        watch(onData) {
          const listener = () => onData(snapshot());
          listeners.add(listener);
          queueMicrotask(listener);
          return () => listeners.delete(listener);
        },
        set: async (col, id, value) => save((d) => { (d[col] ||= {})[id] = value; }),
        update: async (col, id, patch) => save((d) => {
          const doc = d[col]?.[id];
          if (!doc) return;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) delete doc[k];
            else doc[k] = v;
          }
        }),
        removeMany: async (items) => save((d) => items.forEach(({ col, id }) => delete d[col]?.[id])),
      };
    },
  };
}
