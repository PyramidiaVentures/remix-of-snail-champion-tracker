import { useEffect, useState } from "react";
import { signedPhotoUrl } from "@/lib/photoUpload";

/** Resolves a stored photo reference into a short-lived signed URL. */
export function useSignedPhotoUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!stored) {
      setUrl(null);
      return;
    }
    void signedPhotoUrl(stored).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [stored]);
  return url;
}
