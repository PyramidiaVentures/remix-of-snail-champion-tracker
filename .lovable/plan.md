# Rename FCR metrics and expand weighing results

## Build
- Define the requested Economic FCR, Biological FCR, Biological FCR (dry matter), and full SGR labels once in the shared metrics module and use them throughout Results and export-facing copy.
- Add shared interval values for growth per snail per day, pen gain per day, feed offered per day, and feed eaten per day without changing existing formulas.
- Redesign “Weighing of <date>” with one headline-card set per treatment, averaging pen values rather than pooling, followed by the expanded per-pen table.
- Add the same per-day fields and renamed FCR columns to `interval_summary`.
- Check Home and Dashboard for old metric wording and replace it where present.

## Verify
- Confirm Nairobi Pen 2’s 9–23 September interval matches the supplied 14-day values and incomplete Biological FCR message.
- Check the Results screen and downloaded `interval_summary`, then confirm the app builds cleanly.
