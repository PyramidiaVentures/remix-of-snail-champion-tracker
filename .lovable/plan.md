# Multi-site database migration

## Outcome
- Add Nairobi and Roo as sites without changing any current screen.
- Associate every existing pen, trial, and feed with Nairobi.
- Keep all current create/edit flows working by making Nairobi the database default until site selection is added later.
- Allow one active trial per site and pen-label reuse across different sites.
- Store each user’s own default-site preference privately.

## Implementation
1. Create `sites`, grant authenticated shared access, enable row protection, and seed Nairobi/Roo with stable IDs.
2. Add nullable `site_id` fields to `pens`, `trials`, and `feeds`; backfill all rows to Nairobi; add Nairobi defaults; enforce required foreign keys.
3. Add `(site_id, label)` uniqueness for pens. The live schema has no global `pens.label` constraint or index to remove.
4. Replace `trials_single_active` with the per-site active-trial index.
5. Create `user_site_preferences` with authenticated users restricted to their own row.
6. Run the requested count query, database security checks, and verify the unchanged application still builds.

## Technical details
- All changes run in one migration transaction against the live database.
- New public tables receive explicit authenticated and service access grants before row protection policies.
- No screen, component, route, or application behavior will be changed.
