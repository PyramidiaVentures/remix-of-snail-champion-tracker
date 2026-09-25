import { useState } from "react";
import { X, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { penPhotoKey } from "@/components/PenPhotoSlot";
import { useUploads } from "@/lib/photoUploads.store";
import { useSignedPhotoUrl } from "@/lib/useSignedPhotoUrl";

interface Props {
  trialId: string;
  penId: string;
  /** The feeding date — the evening photo is stored against it. */
  date: string;
  /** Human-readable feeding day, e.g. "Sat 19 Sep". */
  fedLabel: string;
  /** Grams offered that evening, when recorded. */
  offeredG: number | null;
  /** The evening photo as stored (unsigned). */
  pmUrl: string | null;
  /** The morning photo as stored (unsigned), before any upload in this session. */
  amUrl: string | null;
}

/** The evening photo of the same dish, shown beside the morning one so the
 *  team can judge how much feed is left rather than recall it. */
export function PhotoCompare({ trialId, penId, date, fedLabel, offeredG, pmUrl, amUrl }: Props) {
  const pending = useUploads().get(penPhotoKey(trialId, penId, date, "am"));
  const before = useSignedPhotoUrl(pmUrl);
  const after = useSignedPhotoUrl(pending?.url ?? amUrl);
  const [zoom, setZoom] = useState<"before" | "after" | null>(null);

  const beforeCaption = `Before — fed ${fedLabel}${offeredG != null ? ` · ${offeredG} g offered` : ""}`;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="text-sm font-medium">Compare with last night</div>
      <div className={after ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
        <Frame
          caption={beforeCaption}
          url={before}
          empty="No evening photo recorded"
          onOpen={() => setZoom("before")}
        />
        {after && (
          <Frame caption="After — this morning" url={after} empty="" onOpen={() => setZoom("after")} />
        )}
      </div>
      {!after && (
        <div className="text-[11px] text-muted-foreground">
          Take the morning photo below and the two will sit side by side.
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={() => setZoom(null)}>
          <div className="flex items-center justify-between p-3 text-xs text-white">
            <span>{zoom === "before" ? beforeCaption : "After — this morning"}</span>
            <button type="button" aria-label="Close" onClick={() => setZoom(null)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex-1 overflow-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              const startX = e.touches[0]!.clientX;
              const end = (ev: TouchEvent) => {
                const dx = (ev.changedTouches[0]?.clientX ?? startX) - startX;
                if (Math.abs(dx) > 50 && before && after) setZoom(dx < 0 ? "after" : "before");
                window.removeEventListener("touchend", end);
              };
              window.addEventListener("touchend", end);
            }}
          >
            {(zoom === "before" ? before : after) && (
              <img
                src={(zoom === "before" ? before : after)!}
                alt={zoom}
                className="mx-auto h-full w-auto max-w-full object-contain"
              />
            )}
          </div>
          {before && after && (
            <div className="flex items-center justify-between p-3 text-white">
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => { e.stopPropagation(); setZoom("before"); }}
                className="inline-flex items-center gap-1 text-xs"
              >
                <ChevronLeft className="h-5 w-5" /> Before
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => { e.stopPropagation(); setZoom("after"); }}
                className="inline-flex items-center gap-1 text-xs"
              >
                After <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Frame({
  caption, url, empty, onOpen,
}: { caption: string; url: string | null; empty: string; onOpen: () => void }) {
  return (
    <figure className="space-y-1">
      {url ? (
        <button type="button" onClick={onOpen} className="block w-full">
          <img
            src={url}
            alt={caption}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-md border border-border bg-background"
          />
        </button>
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background text-[11px] text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          {empty}
        </div>
      )}
      <figcaption className="text-[11px] font-medium text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
