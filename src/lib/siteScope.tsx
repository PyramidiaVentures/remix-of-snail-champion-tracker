import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/components/SiteProvider";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Every field screen works on one site at a time: the site chosen in the header.
 * These helpers keep that scoping in one place so no screen can silently fall
 * back to another site's pens, feeds or trial.
 */

export function useSiteScope() {
  const { selectedSiteId, selectedSite, sites } = useSite();
  return {
    siteId: selectedSiteId,
    siteName: selectedSite?.name ?? "",
    sites,
  };
}

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, undefined, { numeric: true });

/** The active trial for the selected site, or null when that site has none. */
export function useSiteTrial() {
  const { selectedSiteId } = useSite();
  return useQuery({
    queryKey: ["active-trial", selectedSiteId],
    enabled: !!selectedSiteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trials")
        .select("*")
        .eq("status", "active")
        .eq("site_id", selectedSiteId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Every trial belonging to the selected site, newest first. */
export function useSiteTrials() {
  const { selectedSiteId } = useSite();
  return useQuery({
    queryKey: ["trials", selectedSiteId],
    enabled: !!selectedSiteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trials")
        .select("*")
        .eq("site_id", selectedSiteId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<"trials">[];
    },
  });
}

/** Pens at the selected site, ordered naturally by label (Pen 2 before Pen 10). */
export function useSitePens() {
  const { selectedSiteId } = useSite();
  return useQuery({
    queryKey: ["pens", selectedSiteId],
    enabled: !!selectedSiteId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pens").select("*").eq("site_id", selectedSiteId!);
      if (error) throw error;
      return ((data ?? []) as Tables<"pens">[]).slice().sort(byLabel);
    },
  });
}

/** Feeds belonging to the selected site. */
export function useSiteFeeds() {
  const { selectedSiteId } = useSite();
  return useQuery({
    queryKey: ["feeds", selectedSiteId],
    enabled: !!selectedSiteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeds")
        .select("*")
        .eq("site_id", selectedSiteId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Tables<"feeds">[];
    },
  });
}

export function NoActiveTrial({ siteName }: { siteName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      No active trial at {siteName || "this site"}.{" "}
      <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
    </div>
  );
}
