# SNOVA Feed Tracker — Product Document (PDF)

Produce a polished, downloadable PDF that describes everything the tool does, so it can be shared with collaborators, funders, or a new field assistant.

## What the document will cover

1. **Cover page** — product name, one-line purpose, date, owners (Peter: field entry; Simon: setup and decisions).
2. **Overview** — what the experiment is, what the app solves (reliable daily records, no lost data, SOP built in).
3. **Who uses it and how** — the two roles and their daily/weekly touchpoints.
4. **Daily workflow** — the PM feeding session and the AM check, step by step, mirroring the in-app checklists word for word.
5. **Screen-by-screen reference** — Home, PM Feeding, AM Check, Rounds, Results, Setup, Field Guide, Export: what each screen shows and what can be done there.
6. **Photo evidence system** — one photo per pen plus one control-cage photo, per session, stored permanently with links included in the export.
7. **How a feed wins** — plain-language explanation of leftover weighing, the snail-free evaporation control, intake, the day-1 acclimation exclusion, round scoring, champion promotion and the running champion value. A worked numeric example included.
8. **Data captured** — a table of everything recorded (feeds, pens, rounds, daily observations, evaporation controls, session photos) in plain terms.
9. **Export and data safety** — CSV export contents, cloud storage, sign-in requirement.
10. **Troubleshooting and field rules** — mould, spillage, sealed snails, missed days, catching up on an earlier date.
11. **Current limitations** — anything the app does not yet do (e.g. offline capture queue).

## Style

Clean, calm field-tool look matching the app: green/earth palette, generous spacing, US Letter, headings and tables, no decorative filler.

## Technical notes

- Generated with a Python ReportLab script; a DejaVu Sans Unicode font registered so accents and symbols render correctly.
- Wording for checklists and the guide pulled directly from the app source (`pm.tsx`, `am.tsx`, `guide.tsx`) so the document cannot drift from what the assistant sees on the phone.
- Every page rendered to an image and visually inspected for overflow, clipping or layout faults before delivery.
- Saved to `/mnt/documents/SNOVA-Feed-Tracker-Product-Document.pdf` and attached in chat.
- No application code or database changes.
