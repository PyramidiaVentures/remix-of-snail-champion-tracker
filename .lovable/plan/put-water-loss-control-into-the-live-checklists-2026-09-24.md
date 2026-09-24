# Put water-loss control into the live checklists

## Build
- Replace the current control keys with permanent `pm.control_dish` and `am.control_dish` keys, preserving any already-saved control tick during the key transition.
- Show the PM control-dish step only while the test is running, with the current portion and feed name in its text; leave it manually ticked.
- Show the AM control-dish step only while the test is running and mark it complete automatically only after the control leftover is saved.
- Replace the PM summary reminder with a compact linked “Control dish: ticked/not ticked yet” status, and show nothing when the test is off.
- Correct the Field Guide and Trial helper wording to specify an empty matching pen with the same lid and substrate, never a covered box.
- Keep checklist history and all unrelated saved ticks unchanged.

## Verify
- Check PM and AM with the test on and off, including summary status and automatic AM completion.
- Confirm no “covered box” wording remains and the app builds cleanly.
