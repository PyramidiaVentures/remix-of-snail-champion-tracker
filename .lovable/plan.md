# Persistent site selector

## Outcome
- Show a compact site selector in the shared application header on every signed-in screen.
- Load the signed-in user’s saved site; create a Nairobi preference automatically when none exists.
- Save changes immediately so the selection follows the user across sessions and devices.
- Expose the selected site through shared application state without changing any screen’s current data.

## Implementation
1. Add a reusable site context that loads all sites and the current user’s preference.
2. Default safely to Nairobi and create the missing preference row for that user.
3. Save selector changes to the user’s preference row and update shared state immediately.
4. Place a compact, labelled selector beside the app identity in the shared header, keeping navigation and sign-out intact across desktop and mobile.
5. Verify persistence, shared state, unchanged screen data, mobile layout, build health, and access rules.

## Technical details
- Reads and writes use the signed-in browser session, so existing row-level access rules enforce ownership.
- Site state is provided above the shared outlet, making it available to every authenticated screen.
- No existing screen query receives a site filter in this step.
