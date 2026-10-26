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
python tools/serve.py
```

Then open <http://localhost:8765/tests/index.html>. It should say `PASS: 56/56`.
<http://localhost:8765/tests/art-preview.html> shows every room level and creature form side by side.
On localhost the offline cache is off so edits show straight away; add `?sw` to the address to test offline.

## The home scene

The Home tab is your creature's room. It wanders around, and its name and level float above its head.
What it does reflects your day: it lifts on the mat after you train, reads at the shelf if you have read,
sips water, stretches after yoga, and sleeps in bed from 10 pm to 6 am. It sighs at the mess when chores
slip. Tap it for a tip, such as today's first lift or how much water is left. Furniture unlocks as the home levels up
(bed, bookshelf and plant, lamp and beanbag, then a hearth and an aquarium).

## Rules the app follows

- **Loaded lifts use double progression.** Log the weight and the reps for each set (e.g. `8,8,7,7`).
  The app adds reps inside the phase's rep range first, and adds weight only when every set reaches the
  top of the range. Then the reps reset to the bottom of the range. Adding reps works about as well as
  adding weight ([Plotkin et al. 2022](https://peerj.com/articles/14142)).
- **Feel means reps in reserve:** Easy = 3+ left, Good = 1-2 left, Hard = 0 left or a grind,
  Missed = short of target. Training close to failure, but not to it, is enough
  ([Refalo et al. 2023](https://openrepository.aut.ac.nz/bitstreams/9e3df52b-a8b3-4139-b172-feefd51e5334/download)).
  - At the top of the range: Easy adds 2 steps, but only if that is no more than about 5% (upper body)
    or 10% (lower body); otherwise it adds 1 step. Good adds 1 step. Hard repeats.
  - Inside the range: same weight. Easy aims for 2 more reps, Good for 1 more, Hard for the same.
  - Missed: 10% lighter, rounded to the step, and always at least one step down.
  - If no reps are logged, the app uses feel alone with the same caps.
- **Explosive work** (jumps, trap bar jumps, sprints) goes up at most 1 step at a time, because speed
  and quality matter more than load. **Rep-count exercises** (push-ups, pull-ups) add reps by feel.
- **Deload weeks:** 90% of your last normal working weight (at least one step lighter) with about half the
  sets. Cutting volume is the method coaches agree on most
  ([Bell et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/)). The week after a deload
  progresses from your last normal session.
- **New phase (Build 6-8 reps → Strength 3-5):** the starting weight is recalculated from your estimated
  1-rep max (Epley formula) and rounded down. For example, squat 185 × 8 → 200 lb for sets of 3-5.
- **Exercise order:** explosive work first, then the heaviest compound lift, other compounds,
  isolation, and core last. Lifts done early in a session get the most strength gain and quality volume
  ([exercise order review](https://www.unm.edu/~lkravitz/Article%20folder/ExerciseOrderinRT.html)).
  Each exercise shows its place and why. New exercises slot in by type. The library warns you if the
  order looks wrong, and its arrows reorder exercises.
- **Phases:** 10-week cycle from the start date (Mon 19 Oct 2026): 4 Build, Deload, 4 Strength, Deload.
- **Paired days:** Wed/Thu and Sat/Sun share one session and count 0.5 each. Swim on Wed/Thu is paired
  too, so the week plans exactly 12 sessions (4 swims, 4 lifts, 1 run, 1 soccer, 2 yoga).
- **Sessions this week** counts each activity up to its weekly target, so a 5th swim does not hide a missed yoga.
- **Long run cap:** +10% over the longest run in the last 30 days in Build weeks; held in Strength and
  Deload weeks; never above 13.1 mi.
- **Character stats never go down.** The home gets untidy after 7 days with no chores done, messy after
  14, and is tidy again as soon as you tick one chore.
