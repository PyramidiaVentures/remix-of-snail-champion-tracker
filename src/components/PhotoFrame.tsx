import { useState } from "react";
import { ImageOff } from "lucide-react";

import { useSignedPhotoUrl } from "@/lib/useSignedPhotoUrl";

/**
 * One piece of photographic evidence: the image plus a caption that is always
 * visible, so a screenshot of this screen identifies itself.
 */
export function PhotoFrame({
  stored,
  session,
  penLabel,
  siteName,
  date,
  onOpen,
}: {
  stored: string | null | undefined;
  session: string;
  penLabel: string;
  siteName: string;
  date: string;
  onOpen: (url: string, caption: string) => void;
}) {
  const url = useSignedPhotoUrl(stored);
  const [failed, setFailed] = useState(false);
  const caption = `${penLabel} · ${siteName} · ${date} · ${session}`;

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[4/3] w-full bg-muted">
        {stored && url && !failed ? (
          <button
            type="button"
            onClick={() => onOpen(url, caption)}
            className="block h-full w-full"
            aria-label={`Open ${caption} full size`}
          >
            <img
              src={url}
              alt={caption}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
             className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-xs">{stored && !failed ? "Loading…" : "No photo recorded"}</span>
          </div>
        )}
      </div>
      <figcaption className="border-t border-border px-2 py-1.5 text-[11px] leading-tight">
        <span className="font-semibold uppercase tracking-wide">{session}</span>
        <br />
        {penLabel} · {siteName}
        <br />
        {date}
      </figcaption>
    </figure>
  );
}

/** Full-size viewer for a tapped photo. */
export function PhotoLightbox({
  open,
  onClose,
}: {
  open: { url: string; caption: string } | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-label={open.caption}
    >
      <img src={open.url} alt={open.caption} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
      <p className="text-center text-sm text-white">{open.caption}</p>
      <button type="button" className="rounded-lg bg-white/15 px-4 py-2 text-sm text-white" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
