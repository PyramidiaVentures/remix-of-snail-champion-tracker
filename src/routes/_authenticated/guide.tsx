import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/guide")({
  component: GuidePage,
  head: () => ({
    meta: [
      { title: "Field Guide — SNOVA Growth Tracker" },
      { name: "description", content: "The standing operating procedure for the snail feeding trial: evening feeding, morning check, weighing day, dish discard criteria and troubleshooting." },
      { property: "og:title", content: "Field Guide — SNOVA Growth Tracker" },
      { property: "og:description", content: "Evening feeding, morning check, weighing day, discard criteria and troubleshooting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const List = ({ items, ordered }: { items: string[]; ordered?: boolean }) => {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} pl-5 space-y-1`}>
      {items.map((t) => <li key={t}>{t}</li>)}
    </Tag>
  );
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "PM checklist (feeding)",
    body: (
      <List
        ordered
        items={[
          "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
          "Check each dish against the discard criteria. If the remaining feed is sound, top up. If it fails any criterion, empty and clean the dish first.",
          "Weigh the portion for each pen and enter grams offered.",
          "Record the dish action: topped up, emptied and refilled, or emptied because spoiled.",
          "Place feed in each pen, rotating the dish position from yesterday.",
          "Top up calcium and water dishes (never weighed, always present).",
          "Upload one PM photo per pen, dish and paper tag in frame.",
        ]}
      />
    ),
  },
  {
    title: "AM checklist (check)",
    body: (
      <List
        ordered
        items={[
          "Upload the AM photos (one per pen) — dish untouched, tag in frame.",
          "Record the refusal score for each pen by eye. Do not weigh.",
          "Record snail activity and any signs of sickness.",
          "Record temperature and humidity.",
          "Log any deaths, escapes or removals.",
          "Empty and clean any dish whose remaining feed fails the discard criteria.",
        ]}
      />
    ),
  },
  {
    title: "Weighing checklist",
    body: (
      <List
        ordered
        items={[
          "Place the empty container on the scale and zero it, so the scale reads only the snails.",
          "Count every live snail in the pen and enter the count.",
          "Weigh all the snails together and enter the weight the scale shows.",
          "Photograph the scale display with the pen tag in frame.",
          "Return the snails to the pen and confirm the count matches.",
          "Log any snail found dead during handling as a mortality event.",
        ]}
      />
    ),
  },
  {
    title: "Dish discard criteria",
    body: (
      <div className="space-y-2">
        <p>
          Empty and clean the dish if ANY of these is true, otherwise the feed may be carried over and topped up.
          There is NO time limit; judge the feed, not the clock:
        </p>
        <List
          ordered
          items={[
            "Visible mould or fungal growth of any extent.",
            "Sour, fermented or foul smell.",
            "Slimy or sticky texture on the feed itself, as distinct from snail mucus.",
            "Leaves fully dried, brittle or blackened.",
            "Compounded or pelleted feed that has gone soft, swollen, clumped or pasty.",
            "Soil, faeces or substrate mixed into the dish.",
            "Any dead snail found in the dish.",
          ]}
        />
      </div>
    ),
  },
  {
    title: "Golden rules",
    body: (
      <List
        items={[
          "All weights are recorded to 0.1 g on the same scale, on the spot, never from memory.",
          "Feeding time and check time are held constant so the interval stays about 16 hours.",
          "Each feed's dish position within a pen is rotated daily.",
          "Calcium and water are always present in separate dishes, never weighed, never varied.",
          "Weighing is done at the same time of day, before the evening feeding.",
          "Every biomass entry requires a photograph of the scale display.",
          "Live count is never edited directly — it changes only by logging a population event.",
          "Nothing blocks data entry. Missing data, missing photos and missed days all produce advisories, never hard stops.",
        ]}
      />
    ),
  },
  {
    title: "Troubleshooting",
    body: (
      <List
        items={[
          "Feed finished completely, several days running → increase the portion and note it. The snails may have been feed-limited and growth understated.",
          "Most of the feed left, several days running → reduce the portion. Over-portioning inflates the conversion figure without affecting growth.",
          "A snail dies or is missing → log a population event the same day. Never adjust a count silently.",
          "Missed a feeding or a check → log the gap. Never backfill numbers from memory.",
          "Leaves wilted before feeding → discard and cut fresh.",
          "Unsure whether feed has spoiled → discard it. A wasted portion costs a few shillings; feed that sours in the dish can suppress intake across the whole pen.",
          "Weighing count does not match the ledger → re-count. If the count is confirmed, log the difference as a mortality or escape with cause \"unknown\".",
          "Reconciliation panel flags a pen → recount that pen before leaving. If the recount matches the ledger, correct the weighing's live count. If the recount confirms your original number, use Reconcile to log the difference. Never edit a count to silence the warning — the count is what you observed, the ledger is only a running total.",
          "Mean weight jumped or dropped implausibly → re-check the count, the scale zero and the entry before accepting it.",
          "Snails escaped during weighing → log an escape; return recovered snails as an addition.",
        ]}
      />
    ),
  },
];

function GuidePage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Field Guide (SOP)</h1>
        <p className="text-sm text-muted-foreground">Read-only reference. Tap a section to expand.</p>
      </header>
      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <Collapsible key={s.title} title={s.title} defaultOpen={s.title === "PM checklist (feeding)"}>
            {s.body}
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

function Collapsible({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="font-semibold">{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-foreground/90 leading-relaxed">{children}</div>}
    </div>
  );
}
