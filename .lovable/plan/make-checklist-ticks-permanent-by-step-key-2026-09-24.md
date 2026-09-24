# Make checklist ticks permanent by step key

## Build
- Define every PM, AM, and weighing checklist item with a permanent key and display text.
- Add keyed tick storage to checklist records while retaining the old position array as deprecated history.
- Backfill every existing record by its session and date: dates before 24 September 2026 use the old PM/AM lists; dates from 24 September use the new lists; weighing uses its existing list.
- Update checklist saving, offline recovery, completion blocking, Home, and Dashboard exceptions to read and write ticks by key.
- Keep unknown or removed keys in stored history while showing only keys present in the current checklist.

## Verify
- Confirm historical records map to the correct old keys and current records to current keys.
- Confirm toggling, reloading, reordering, and an unknown historical key do not move or erase saved ticks.
- Run the app checks and verify PM, AM, and weighing checklists render correctly.
