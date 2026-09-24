import { AM_STEPS, PM_STEPS, WEIGH_STEPS } from "@/lib/sopSteps";
import { createFileRoute } from "@tanstack/react-router";
import { today } from "@/lib/date";
import { useSiteScope } from "@/lib/siteScope";
import { operatingDaysSentence, useSiteCalendar } from "@/lib/operatingDays";
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
         items={PM_STEPS.map((step) => step.label)}
      />
    ),
  },
  {
    title: "AM checklist (check)",
    body: (
      <List
        ordered
         items={AM_STEPS.map((step) => step.label)}
      />
    ),
  },
  {
    title: "Weighing checklist",
    body: (
      <List
        ordered
         items={WEIGH_STEPS.map((step) => step.label)}
      />
    ),
  },
  {
    title: "Breeder pens: dish discard criteria",
    body: (
      <div className="space-y-2">
        <p>
          Breeder pens only — trial-pen dishes are emptied, weighed and cleaned every morning. Empty and clean a
          breeder dish if ANY of these is true, otherwise the feed may be carried over and topped up. There is NO
          time limit; judge the feed, not the clock:
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

/** The site's operating days: no feeding or check happens on a closed day. */
function OperatingDaysLine() {
  const { siteName } = useSiteScope();
  const { calendar, closures } = useSiteCalendar();
  const upcoming = closures.filter((c) => c.closure_date >= today()).slice(0, 3);
  return (
    <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">
      <span className="font-medium">{siteName || "This site"}: {operatingDaysSentence(calendar)}</span>{" "}
      No feeding and no check happens on a closed day.
      {upcoming.length > 0 && (
        <> Also closed:{" "}
          {upcoming.map((c) => `${c.closure_date}${c.reason ? ` (${c.reason})` : ""}`).join(", ")}.
        </>
      )}
    </p>
  );
}

function GuidePage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Field Guide (SOP)</h1>
        <p className="text-sm text-muted-foreground">Read-only reference. Tap a section to expand.</p>
      </header>

      <OperatingDaysLine />
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
