import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/guide")({
  component: GuidePage,
});

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Golden rules (never break these)",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Always leave leftovers in every dish — never let a feed be eaten to zero.</li>
        <li>Control feed gets identical treatment to test feed (same feed, same cut time, same portion, same dish, same location, same weigh times) — only difference: no snails.</li>
        <li>Weigh everything to 0.1 g on the same scale; record on the spot, never from memory.</li>
        <li>Same feeding time and same check time every day (keep the ~16 h window constant).</li>
        <li>Same-day cut leaves only; never fed after overnight storage.</li>
        <li>Rotate each feed's dish position in the pen every day.</li>
        <li>Calcium and water always present in separate dishes; never weighed, never varied.</li>
      </ul>
    ),
  },
  {
    title: "Equipment",
    body: (
      <p>0.1 g digital scale + spare batteries; identical numbered feed dishes; a snail-free control cage that sits inside or beside a pen so its climate matches; paper tags + marker; the app on a phone; cloth for cleaning dishes.</p>
    ),
  },
  {
    title: "PM routine (feeding)",
    body: (
      <ol className="list-decimal pl-5 space-y-1">
        <li>Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).</li>
        <li>Weigh a generous portion of each feed — enough that there WILL be leftovers tomorrow.</li>
        <li>Enter grams given for each pen × feed.</li>
        <li>Weigh a matching-size control portion of each feed; enter control given.</li>
        <li>Place feed in each pen, rotating each feed's position from yesterday.</li>
        <li>Put control portions in the snail-free control cage beside the pens.</li>
        <li>Top up calcium and water dishes (never weighed, always present).</li>
        <li>Take the PM photo with the paper tag (feed + pen + date) in frame.</li>
      </ol>
    ),
  },
  {
    title: "AM routine (check)",
    body: (
      <ol className="list-decimal pl-5 space-y-1">
        <li>Take the AM photo first — leftovers untouched, tag in frame.</li>
        <li>Weigh leftover of each pen × feed; enter it.</li>
        <li>Weigh leftover of each control; enter it.</li>
        <li>Remove and bin ALL old feed; wipe dishes clean.</li>
      </ol>
    ),
  },
  {
    title: "Round close (Simon)",
    body: <p>Review the 3 days → drop day 1 (acclimation) → check the ranking → promote the winner to champion → load the 2 new challengers → relabel dishes.</p>,
  },
  {
    title: "Troubleshooting (if X, do Y)",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Feed eaten to zero → increase its portion next feeding; note it (measurement was capped).</li>
        <li>Snail dies or is missing → remove it from the pen.</li>
        <li>Missed a feeding or check → log the gap; never backfill numbers from memory.</li>
        <li>Leaves wilted before feeding → discard, cut fresh.</li>
        <li>Spill/contamination in a dish → void that dish for the day in notes.</li>
      </ul>
    ),
  },
  {
    title: "Roles",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Peter</strong> — feeding, weighing, photos, observations, entry.</li>
        <li><strong>Simon</strong> — round setup, ranking, decisions.</li>
      </ul>
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
        {SECTIONS.map((s) => <Collapsible key={s.title} title={s.title} defaultOpen={s.title === "Golden rules (never break these)"}>{s.body}</Collapsible>)}
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
