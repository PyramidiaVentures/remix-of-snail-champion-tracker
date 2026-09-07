# Remix of Snail Champion Tracker

Build a mobile-friendly web app called **SNOVA Feed Tracker** to run a snail feed

palatability experiment reliably. Use **Supabase** for the database and auth so no data is

ever lost. Keep the daily data-entry screens fast and thumb-friendly — they'll be used on a

phone at the pens by a field assistant. **The standard operating procedure must live inside

the app**: show the relevant steps as an inline checklist on each entry screen, and provide a

full Field Guide screen.

### What the experiment is (context for the app logic)

We rank candidate snail feeds by how much snails eat. There are **3 pens**, each holding one

age group (Juveniles, Growers, Adults). In each **round** we test the **same 3 feeds

simultaneously in every pen**. The feeds compete; the winner is carried into the next round as

the "champion" and the other two are replaced by new challengers. We keep a **no-snail

evaporation control** portion of each feed so we can subtract moisture loss. Every feed is

scored **relative to the champion it competed against**, and because the champion chains from

round to round, all feeds end up on one comparable ladder.

### Data model (Supabase tables)

1. **feeds**: id, name, source, cost_per_kg (nullable), availability (enum: year_round /

   seasonal), status (enum: pending / active / champion / eliminated), created_at.

2. **pens**: id, label, age_group (Juveniles / Growers / Adults), snail_count (int), notes.

3. **rounds**: id, round_number (int), start_date, end_date, status (active / closed),

   champion_feed_id (nullable), feed_ids (array of 3), champion_global_value (number), notes.

4. **observations** (one row per round × pen × feed × date): id, round_id, pen_id, feed_id,

   obs_date, weight_given_g (evening), weight_leftover_g (next morning), notes, photo_am_url,

   photo_pm_url, is_acclimation (bool).

5. **evap_controls** (one row per round × feed × date): id, round_id, feed_id, obs_date,

   control_given_g, control_leftover_g.

6. **pen_daily** (one row per pen × date): id, pen_id, obs_date, temp_c (nullable),

   humidity_pct (nullable), snail_activity (enum: active / mixed / mostly_sealed),

   deaths_count (int, default 0).

### Core calculations (implement exactly)

For each observation:

- `fresh_loss = weight_given_g - weight_leftover_g`

- `evap_fraction = (control_given_g - control_leftover_g) / control_given_g` (matching feed +

  date; if missing, leave the observation out of scoring)

- `intake = fresh_loss - (weight_given_g * evap_fraction)` (floor at 0)

**Scoring days:** the first day a feed appears in a round is an acclimation day

(`is_acclimation = true`) and is excluded from scoring by default; provide a toggle.

**Champion-relative score (per round):**

- Champion feed = `rounds.champion_feed_id` (carried from previous round; none in round 1).

- `mean_intake(feed, pen)` = average `intake` across the round's scoring days.

- `pen_ratio(feed, pen) = mean_intake(feed, pen) / mean_intake(champion, pen)` (round 1: use

  the pen's highest-intake feed as reference).

- `round_score(feed) = average of pen_ratio across the 3 pens`. Highest wins; a challenger

  with `round_score > 1` beat the champion and becomes the new champion.

**Full leaderboard (champion-chaining):** round 1 champion global value = 1.0; a new champion

in round k with `round_score = s` gets global value `previous_global_value * s`; any feed's

`global_score = round_score × champion_global_value of its round`. Rank the leaderboard by

global_score. Label it: "Reliable at the top (best feeds) and bottom (clear rejects);

middle rankings are approximate."

### Screens

**1. Setup** — manage pens (age group, snail count); feed library (name, source, cost_per_kg,

availability).

**2. Rounds** — start a round (pre-selects the locked champion + pick 2 challengers; round 1

picks all 3). Close a round shows a **round-close checklist** (below), the ranking, the

winner, and a one-tap "Promote to champion & start next round."

**3. Daily entry — PM (Feeding, ~4:30 PM).** Show this ordered checklist inline at the top,

each item tickable, before/while entering numbers:

   1. Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).

   2. Weigh a generous portion of each feed — enough that there WILL be leftovers tomorrow.

   3. Enter grams *given* for each pen × feed.

   4. Weigh a matching-size control portion of each feed; enter control *given*.

   5. Place feed dishes in each pen, **rotating each feed's position from yesterday**.

   6. Put control portions in the snail-free control cage beside the pens.

   7. Top up calcium and water dishes (never weighed, always present).

   8. Take the PM photo with the paper tag (feed + pen + date) in frame.

   Big number pads. Reminder text: "Give more than they can finish."

**4. Daily entry — AM (Check, ~9:00 AM).** Inline ordered checklist:

   1. Take the AM photo first — leftovers untouched, tag in frame.

   2. Weigh leftover of each pen × feed; enter it (live-shows computed `intake`).

   3. Weigh leftover of each control; enter it.

   4. Record snail_activity (active / mixed / mostly_sealed) and deaths_count per pen.

   5. Remove and bin ALL old feed; wipe dishes clean.

   6. (Optional) temp_c and humidity_pct per pen.

   Soft, non-blocking reminder only (not a flag): if leftover > given, prompt "check the

   weighing." Nothing is blocked; the assistant can always save.

**5. Results dashboard** — Current round: bar chart of `round_score` with a per-pen breakdown

(surface age disagreements). Champion trend: line of champion `intake` across rounds.

Leaderboard: every feed by `global_score` with cost_per_kg and availability alongside.

**6. Field Guide (SOP)** — a read-only reference screen, reachable from the main menu and

linked from both entry screens, containing the full text in the "FIELD GUIDE CONTENT" section

below. Render it as clear collapsible sections.

**7. Export** — download all tables as CSV.

### FIELD GUIDE CONTENT (put verbatim on the Field Guide screen)

**Golden rules (never break these):**

- Always leave leftovers in every dish — never let a feed be eaten to zero.

- Control feed gets identical treatment to test feed (same feed, same cut time, same portion,

  same dish, same location, same weigh times) — only difference: no snails.

- Weigh everything to 0.1 g on the same scale; record on the spot, never from memory.

- Same feeding time and same check time every day (keep the ~16 h window constant).

- Same-day cut leaves only; never fed after overnight storage.

- Rotate each feed's dish position in the pen every day.

- Calcium and water always present in separate dishes; never weighed, never varied.

**Equipment:** 0.1 g digital scale + spare batteries; identical numbered feed dishes; a

snail-free control cage that sits inside or beside a pen so its climate matches; paper tags +

marker; the app on a phone; cloth for cleaning dishes.

**PM routine (feeding):** the 8 steps on the PM screen.

**AM routine (check):** the 6 steps on the AM screen.

**Round close (Simon):** review the 3 days → drop day 1 (acclimation) → check the ranking →

promote the winner to champion → load the 2 new challengers → relabel dishes.

**Troubleshooting (if X, do Y):**

- Feed eaten to zero → increase its portion next feeding; note it (measurement was capped).

- Snail dies or is missing → record in deaths_count, remove it.

- Missed a feeding or check → log the gap; never backfill numbers from memory.

- Leaves wilted before feeding → discard, cut fresh.

- Spill/contamination in a dish → void that dish for the day in notes.

- Snails mostly sealed/inactive → record it; that pen likely didn't feed that night.

**Roles:** Peter — feeding, weighing, photos, observations, entry. Simon — round setup,

ranking, decisions.

### Design

Clean, calm field-tool aesthetic. Green/earth palette. Large tap targets, minimal typing,

number pads for weights. Prioritise reliability and clarity over polish.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/74e7ef71-c0c4-4fc6-b911-2ed58bc722a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
