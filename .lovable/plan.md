# SNOVA Feed Tracker — Product Specification Document (PDF)

Produce a downloadable PDF that describes the tool's full functionality, written and structured so that another AI (Claude) can ingest it and reason about the system accurately with no other context.

## Optimised for machine reading

- Strict, predictable hierarchy: numbered sections and subsections, one idea per paragraph, no marketing prose, no ambiguous pronouns.
- Every entity, field, screen and rule named exactly as it exists in the system, with its type and allowed values.
- Formulas written explicitly with named variables, plus a worked numeric example with the exact inputs and outputs.
- Rules stated as declarative statements ("The system does X when Y"), not narrative.
- Terminology table at the front so a reader binds each domain term once.
- Selectable, extractable text (no text-as-image), simple single-column layout, plain tables — so PDF text extraction preserves reading order.
- Short section IDs (e.g. `4.2`) so a reader can cite precisely.

## Contents

1. Document purpose, scope, and how to read it (audience: an AI assistant reasoning about the system).
2. Glossary of domain terms.
3. System overview: what the experiment is, what the app does, roles (Peter — field entry; Simon — round setup and decisions).
4. Data model: each entity (feeds, pens, rounds, observations, evaporation controls, session photos) with fields, types, enumerated values, keys and relationships.
5. Screen reference: Home, PM Feeding, AM Check, Rounds, Results, Setup, Field Guide, Export — purpose, inputs, outputs, and behaviour of each.
6. Daily workflow: PM and AM checklist steps quoted verbatim from the app, plus date-linkage rules (AM completes the prior day's PM entry).
7. Photo evidence model: one photo per pen plus one control-cage photo per session, storage path convention, permanent links, and how completeness is computed.
8. Scoring and decision logic: fresh loss, evaporation fraction, intake (floored at zero), acclimation-day exclusion, per-pen champion ratio, round score, champion promotion, running champion value — with formulas and a worked example.
9. Business rules and invariants, including the "never block saving" principle and independent save of numbers vs photos.
10. Export format: CSV sections and columns, including photo link columns.
11. Field troubleshooting rules (if X then Y), quoted from the Field Guide.
12. Known limitations and non-goals.

## Style

Clean and utilitarian, matching the app's green/earth palette lightly (headings and rules only). US Letter, generous margins, high-contrast body text.

## Technical notes

- Generated with a Python ReportLab script; DejaVu Sans registered as a Unicode font.
- Content sourced directly from project files (`src/routes/_authenticated/*.tsx`, `src/lib/scoring.ts`, `src/lib/csv.ts`, `src/integrations/supabase/types.ts`) so the document matches the shipped behaviour.
- Text-extraction check after generation (`pdftotext`) to confirm the reading order and formulas survive extraction, plus per-page visual inspection for clipping or overflow.
- Saved to `/mnt/documents/SNOVA-Feed-Tracker-Spec.pdf` and attached in chat.
- No application code or database changes.
