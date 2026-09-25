# TolerATE: setup & deployment guide

The app is a set of plain web files: nothing to install or build. Firebase
stores the shared data, Vercel puts the app on the web, and (optionally) a
small Vercel function copies everything into a Google Sheet.

Everything here runs on free tiers.

---

## Part 1: Firebase (about 5 minutes)

1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**.
   Name it `tolerate`. Google Analytics isn't needed.
2. **Build → Firestore Database → Create database.** Pick a region near you
   (e.g. `europe-west2`, London) and start in **production mode**.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
4. **Firestore Database → Rules:** delete what's there, paste in the whole of
   `firestore.rules` from this folder, and click **Publish**.
5. **Project settings** (⚙ next to Project Overview) → **Your apps** → the `</>` (Web) button.
   Name it `TolerATE` (no hosting needed) and click **Register app**.
6. Copy the values from the `firebaseConfig` it shows into `js/firebase-config.js`
   (replacing `PASTE_API_KEY_HERE` and the empty strings).

Until step 6 is done, the app runs in **local mode**: it works, but data stays
in that one browser.

---

## Part 2: Put it online with Vercel

1. Create a **private** GitHub repository called `tolerate` and upload everything
   in this folder (`index.html`, `manifest.webmanifest`, `sw.js`, `firestore.rules`,
   and the `api`, `css`, `js` and `icons` folders).
2. At [vercel.com](https://vercel.com) → **Add New → Project** → import `tolerate`.
   Leave the settings as they are and click **Deploy**.
3. You get a link like `tolerate.vercel.app`. Pushing changes to GitHub updates it automatically.

---

## Part 3: Install on your phones

1. Open the Vercel link in **Chrome** (Android) or **Safari** (iPhone).
2. Android: **⋮ → Install app**. iPhone: **Share → Add to Home Screen**.
3. First phone: choose **Start new** and add your child.
4. **Settings → Share code → Copy**, and send it to the other phones.
   There, choose **I have a code** and paste it.

---

## Part 4 (optional): the live Google Sheet

After each change, the app sends the data to `/api/sync`, which rewrites the
sheet: a **TolerATE summary** tab plus one tab per allergen. The app only
manages tabs it created, so you can add your own tabs too. Don't edit the
app's tabs by hand: they're overwritten on the next change.

### 1. Make a service account (a "robot" Google account for the app)
1. Open [Google Cloud console](https://console.cloud.google.com) and pick the
   **tolerate** project (Firebase created it) in the top bar.
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **IAM & Admin → Service accounts → Create service account.** Name it `sheet-writer`,
   click **Create and continue**, skip the optional steps and click **Done**.
4. Click the new account → **Keys → Add key → Create new key → JSON → Create.**
   A `.json` file downloads. **Keep it private** (it's a password). Don't put it
   in this folder or on GitHub.
5. Note the account's email, like `sheet-writer@tolerate-xxxx.iam.gserviceaccount.com`.

### 2. Make the sheet
1. Create a new Google Sheet (e.g. "TolerATE – Sam").
2. **Share** it with the service account's email as **Editor** (untick "Notify").
3. Copy the sheet's id from its URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

### 3. Tell Vercel
In Vercel → your project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT` | the **entire contents** of the downloaded `.json` file |
| `SHEET_ID` | the id from the sheet's URL |
| `HOUSEHOLD_CODE` | your share code from the app's Settings (e.g. `TOL7KQ2MP`) |

Then **Deployments → ⋯ on the latest → Redeploy**.

In the app, **Settings → Google Sheet** should now show **Open sheet** and **Update now**.
Tap **Update now** once to fill it. After that it updates by itself after
each change (and catches up after being offline). You can delete the empty
`Sheet1` tab.

---

## Part 5 (optional): the daily noon reminder (Android)

At noon, each phone that has turned it on gets a notification listing any
allergens with nothing logged today (maintenance ones included), e.g.
"Sam: Peanut, Sesame". If everything's logged, nothing is sent.

Do Part 4 first: this uses the same service account and `HOUSEHOLD_CODE`.

1. **Let the service account read the database.** In
   [Google Cloud → IAM](https://console.cloud.google.com/iam-admin/iam?project=tolerate-75e26),
   click **Grant access**, paste the service account's email, give it the role
   **Cloud Datastore User**, and click **Save**.
2. **Update the Firestore rules.** Paste the current `firestore.rules` into
   **Firestore Database → Rules** and click **Publish**. (It now allows a `devices` collection.)
3. **Add these environment variables in Vercel.** The values are generated for you;
   Claude gives you them separately. They're secrets, so don't put them in GitHub.

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the public key |
   | `VAPID_PRIVATE_KEY` | the private key |
   | `CRON_SECRET` | the long random text |

   Then **Redeploy**.
4. **On each phone that wants reminders:** open the app from the home screen →
   **Settings → Daily reminder** → switch on **Remind me at noon** → **Allow**
   notifications. Tap **Send a test notification** to check it works.

**Timing:** Vercel's free plan runs daily jobs at some point within the hour
they're scheduled for. The job runs at 11:00 and 12:00 UTC and only sends
during the 12 o'clock hour in London, so the reminder arrives between 12:00
and 13:00, in both summer and winter time.

---

## Costs: when would you pay?

At a few users you stay comfortably inside the free tiers:

- **Firestore (Spark plan):** 50,000 reads and 20,000 writes a day, 1 GB stored.
  A family logging doses uses well under 1% of that. The Spark plan has no card
  on file, so it can't charge you. At worst it pauses until the next day.
- **Vercel (Hobby):** free for personal, non-commercial use.
- **Google Sheets API:** free.

You'd only need to pay if the app were used commercially (Vercel Pro), or if it
grew to thousands of active users.

---

## Trying it on this computer

In Claude Code, ask Claude to "run the app". Or, from a terminal in this folder:

```
python -m http.server 5174
```

and open http://localhost:5174. (The Google Sheet sync only works on Vercel.)
