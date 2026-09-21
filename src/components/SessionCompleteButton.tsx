import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, PartyPopper } from "lucide-react";

const PIECES = 28;
const PIECE_COLORS = ["#16a34a", "#f59e0b", "#0ea5e9", "#e11d48", "#8b5cf6", "#facc15"];

function ConfettiOverlay() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        size: 6 + Math.random() * 8,
        color: PIECE_COLORS[i % PIECE_COLORS.length],
        round: i % 3 === 0,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      <style>{`@keyframes confetti-fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.6; } }`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function storageKey(session: string, trialId: string | null | undefined, date: string) {
  return `session-complete-${session}-${trialId ?? "none"}-${date}`;
}

/**
 * Shown on the session summary once every pen is done and the SOP steps are
 * ticked. Clicking plays a short celebration and returns to the home screen.
 * Completion is remembered per trial/date/session on this device, so coming
 * back to the session shows it as completed and no longer clickable.
 */
export function SessionCompleteButton({
  label,
  enabled,
  session,
  trialId,
  date,
}: {
  label: string;
  enabled: boolean;
  session: "pm" | "am";
  trialId: string | null | undefined;
  date: string;
}) {
  const navigate = useNavigate();
  const [celebrating, setCelebrating] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setCompleted(
      typeof window !== "undefined" && !!window.localStorage.getItem(storageKey(session, trialId, date)),
    );
  }, [session, trialId, date]);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => {
      void navigate({ to: "/home" });
    }, 1800);
    return () => clearTimeout(t);
  }, [celebrating, navigate]);

  if (completed && !celebrating) {
    return (
      <div className="pt-1">
        <button
          type="button"
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 py-4 text-sm font-semibold text-primary"
        >
          <CheckCircle2 className="h-5 w-5" />
          {label.replace(/^Complete\s+/, "")} completed
        </button>
      </div>
    );
  }

  return (
    <div className="pt-1">
      {celebrating && <ConfettiOverlay />}
      <button
        type="button"
        disabled={!enabled || celebrating}
        onClick={() => {
          window.localStorage.setItem(storageKey(session, trialId, date), new Date().toISOString());
          setCelebrating(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        <PartyPopper className="h-5 w-5" />
        {celebrating ? "All done — well done!" : label}
      </button>
      {!enabled && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Available once every pen is complete and all SOP steps are ticked.
        </p>
      )}
    </div>
  );
}
