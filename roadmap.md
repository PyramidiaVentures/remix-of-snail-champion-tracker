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
