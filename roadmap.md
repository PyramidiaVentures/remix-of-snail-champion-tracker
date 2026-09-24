- [x] Mandatory AM/PM SOP checklists popup
- [x] Add live-safe multi-site database support and verify the app
- [x] Add a persistent site selector and global site context

## Closed days invisible (new ask, 2026-09-21)
- [x] 1. Confirm default date skips closed days (or report Nairobi config issue instead of changing logic)
- [x] 2. Dashboard date picker: disable non-operating dates
- [x] 3. Prev/Next day arrows skip closed days entirely
- [x] 4. Charts omit closed days from x-axis (refusal, cumulative feed, temp/humidity) — no zeros/gaps/placeholders
- [x] 5. Weekly summaries computed over operating days only (denominator = operating days)
- [x] 6. Direct navigation to a closed date renders only "{date} — no operations at {site}"
- [x] 7. Home exceptions summary never reports a closed day (shared skipping logic)
- No change to conversion/gain/growth calculations

## In progress from previous turn
- [x] Home exceptions summary block + OtherSites counts
- [x] Typecheck
- [x] Playwright verify /home + /dashboard consistency, then feature summary to user

## Leftover + leaf control in calculations (2026-09-24)
- [x] 1. Water-loss retention per night, statuses
- [x] 2. eaten_g / share_left per observation
- [x] 3. Interval feed window obs_date >= A and < B (Pens 1–5 = 1,035 g)
- [x] 4. cum_eaten, coverage, FCR (feed eaten) headline, mean share left
- [x] 5. Replace refusal_score rules with share-left rules/bands
- [x] 6. Remove carry-over/spoilage for trial pens in Results + interval_summary

## Weigh Day due-only (2026-09-24)
- [x] 1. Shared "due on date" rule (weighSchedule)
- [x] 2. Stepper shows due pens only + "Weigh another pen anyway"
- [x] 3. Completion panel, ledger mismatches, close/reopen (weighing_sessions)
- [x] 3b. Results "Weighing of <date>" section
- [x] 4. Home/dashboard/exceptions use due rule
- [x] 5. No pens due message

## Results weighing metrics (2026-09-24)
- [x] Rename Economic FCR, Biological FCR, Biological FCR (dry matter), and SGR throughout Results and Export
- [x] Add treatment headline cards to each closed weighing report using mean-of-pens figures
- [x] Add shared per-day interval metrics to the weighing table and interval_summary
- [x] Verify Nairobi Pen 2 for 9–23 September against the supplied values

## AM environment ranges (2026-09-24)
- [x] Add minimum and maximum temperature and humidity to morning records
- [x] Show the recorded ranges on the daily dashboard
- [x] Use recorded ranges in environment trends and weekly summaries
- [x] Preserve historical single readings as both ends of the range

## Permanent checklist keys (2026-09-24)
- [x] Give every PM, AM, and weighing step a permanent key
- [x] Map stored positional ticks using the checklist version live on each date
- [x] Save and read shared and offline ticks by key
- [x] Preserve retired keys without showing them in current checklists
