# Routine Tracker

Offline iPhone web app (PWA) for training, habits and nutrition, with an original fire/water creature that
evolves as you train and a home that improves with chores. Free to host and run: no account, no API keys,
no backend. All data stays on your phone.

## What is built

| Phase | Status |
|---|---|
| 1. Core tracker | Done: 5 tabs, settings, schedule and phase calendar, lift logging with feel progression, daily habit log, dashboard metrics, JSON backup, CSV export and import |
| 2. Game layer | Done: STR/INT/END/VIT XP with daily caps, 5 evolution forms, chores, home levels with slow decay, Stats page with charts |
| 3. Free coach and food | Done: rules coach, recovery flags, weekly review, Ask Claude copy/paste with a diff you accept or reject, food photo prompt and paste-back |
| 3. Optional free-tier API (Gemini) | Not built. Copy/paste covers it for free |
| 4. Garmin | Not built (file import is the next step) |
| 5. Paid API | Not built (opt-in only) |

## Put it on your iPhone (one time, about 15 minutes)

You need a free GitHub account. GitHub Pages gives the app the HTTPS address iOS needs to install it.

1. Go to <https://github.com/new>. Name the repository `routine-tracker`, set it to **Public**
   (free GitHub Pages needs a public repo; it holds only app code, never your data), and click **Create repository**.
2. Upload the files, using either option:
   - **Web upload:** on the new repo page click **uploading an existing file**, drag in everything inside
     this `routine-tracker` folder (including the `.nojekyll` file), then click **Commit changes**.
   - **Command line:** in a terminal opened in this folder, run the commands under "Command line upload" below.
3. In the repo go to **Settings → Pages**. Under **Build and deployment** choose
   **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then **Save**.
4. Wait 1-2 minutes, refresh that page, and copy the address it shows, e.g.
   `https://YOUR-NAME.github.io/routine-tracker/`.
5. On your iPhone, open that address **in Safari** (not Chrome).
6. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
7. Open the app **from the new Home Screen icon**. Do not keep using it in a Safari tab: iOS keeps
   Home Screen app data separately and is less likely to clear it.
8. Check it works offline: turn on Airplane Mode, close the app fully (swipe it away), open it again.

### Command line upload

```bash
git init -b main
```
```bash
git add .
```
```bash
git commit -m "feat: routine tracker v1"
```
```bash
gh repo create routine-tracker --public --source . --push
```

(The last step needs the GitHub CLI signed in; run `gh auth login` first if it asks.)

## Weekly habit: back up

iOS can delete web app data if the app goes unused for a few weeks. The Home tab shows a reminder when
your last backup is over 7 days old.

1. **Coach → ⚙ Settings → Back up now (JSON)**.
2. In the share sheet choose **Save to Files** and pick iCloud Drive.

To restore (new phone, or data cleared): **Settings → Restore from backup**, then pick the file.

## Using the Ask Claude coach (free, uses your Claude subscription)

1. **Coach → Copy coach prompt**.
2. Open the Claude app, paste, send.
3. Copy Claude's reply (the JSON), go back, paste it into the box, tap **Compare with rules plan**.
4. Tick the changes you want and tap **Accept ticked**. They replace the rules targets for the next
   session of each of those lifts. Tap **use rules** next to one to undo it.

Food photos work the same way from **Habits → Food → Copy photo prompt**: paste the prompt into Claude
with your photo, paste the reply back, check the numbers, **Save meal**. Its protein is added to the day.

## Using your own creature or room art

Drop PNG files into `assets/character/` (`stage-1.png` … `stage-5.png`) and `assets/environment/`
(`level-1.png` … `level-5.png`), upload them to GitHub, and they replace the placeholders. See
`assets/README.md`.

## Changing the app later

After editing any file, run this before uploading, so installed phones get the update:

```bash
python tools/release.py
```

The phone shows **A new version is ready → Update** the next time the app opens online.

Things you may want to tune without touching UI code:

- Program, schedule, exercise seed list, sets × reps, pace rates: `js/config/program.js`
- XP amounts, daily caps, level curve, evolution requirements, home levels and decay: `js/config/game.js`
- Targets, start date, phase, level, exercises: in the app under **Settings**

## Running the tests

There is no Node on this PC, so the tests run in a browser:

```bash
python -m http.server 8765
```

Then open <http://localhost:8765/tests/index.html>. It should say `PASS: 43/43`.

## Rules the app follows

- **Progression by feel:** Easy +2 steps, Good or blank +1 step, Hard repeat, Missed -10% rounded to the
  step (and always at least one step lighter).
- **Deload weeks:** target is 90% of the last non-deload working value, again at least one step lighter.
  Deload sessions never move the working weight, so the week after a deload progresses from the last
  normal session.
- **Phases:** 10-week cycle from the start date (Mon 19 Oct 2026): 4 Build, Deload, 4 Strength, Deload.
- **Paired days:** Wed/Thu and Sat/Sun share one session and count 0.5 each. Swim on Wed/Thu is paired
  too, so the week plans exactly 12 sessions (4 swims, 4 lifts, 1 run, 1 soccer, 2 yoga).
- **Sessions this week** counts each activity up to its weekly target, so a 5th swim does not hide a missed yoga.
- **Long run cap:** +10% over the longest run in the last 30 days in Build weeks; held in Strength and
  Deload weeks; never above 13.1 mi.
- **Character stats never go down.** The home gets untidy after 7 days with no chores done, messy after
  14, and is tidy again as soon as you tick one chore.
