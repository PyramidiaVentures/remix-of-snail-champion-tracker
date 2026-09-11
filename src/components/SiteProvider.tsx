import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Site = Tables<"sites">;

type SiteContextValue = {
  sites: Site[];
  selectedSite: Site | null;
  selectedSiteId: string | null;
  setSelectedSiteId: (siteId: string) => void;
  isLoading: boolean;
  isSaving: boolean;
  errorMessage: string | null;
};

const SiteContext = createContext<SiteContextValue | null>(null);

async function loadSitePreference(userId: string) {
  const [{ data: sites, error: sitesError }, { data: preference, error: preferenceError }] =
    await Promise.all([
      supabase.from("sites").select("*").order("name"),
      supabase
        .from("user_site_preferences")
        .select("default_site_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (sitesError) throw sitesError;
  if (preferenceError) throw preferenceError;

  const availableSites = sites ?? [];
  const nairobi = availableSites.find((site) => site.name === "Nairobi");
  const savedSite = availableSites.find((site) => site.id === preference?.default_site_id);
  const defaultSite = savedSite ?? nairobi ?? availableSites[0] ?? null;

  if (!preference && defaultSite) {
    const { error } = await supabase.from("user_site_preferences").insert({
      user_id: userId,
      default_site_id: defaultSite.id,
    });
    if (error) throw error;
  }

  return { sites: availableSites, selectedSiteId: defaultSite?.id ?? null };
}

export function SiteProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryKey = ["site-preference", userId] as const;
  const preferenceQuery = useQuery({
    queryKey,
    queryFn: () => loadSitePreference(userId),
  });
  const [selectedSiteId, setSelectedSiteIdState] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (preferenceQuery.data?.selectedSiteId) {
      setSelectedSiteIdState(preferenceQuery.data.selectedSiteId);
    }
  }, [preferenceQuery.data?.selectedSiteId]);

  const savePreference = useMutation({
    mutationFn: async (siteId: string) => {
      const { error } = await supabase.from("user_site_preferences").upsert(
        { user_id: userId, default_site_id: siteId },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return siteId;
    },
    onSuccess: (siteId) => {
      setSaveError(null);
      preferenceQuery.refetch();
      setSelectedSiteIdState(siteId);
    },
    onError: () => {
      setSelectedSiteIdState(preferenceQuery.data?.selectedSiteId ?? null);
      setSaveError("Site could not be saved. Please try again.");
    },
  });

  const value = useMemo<SiteContextValue>(() => {
    const sites = preferenceQuery.data?.sites ?? [];
    return {
      sites,
      selectedSite: sites.find((site) => site.id === selectedSiteId) ?? null,
      selectedSiteId,
      setSelectedSiteId: (siteId) => {
        if (siteId === selectedSiteId) return;
        setSaveError(null);
        setSelectedSiteIdState(siteId);
        savePreference.mutate(siteId);
      },
      isLoading: preferenceQuery.isPending,
      isSaving: savePreference.isPending,
      errorMessage: saveError ?? (preferenceQuery.isError ? "Sites could not be loaded." : null),
    };
  }, [preferenceQuery.data, preferenceQuery.isPending, preferenceQuery.isError, selectedSiteId, savePreference, saveError]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSite must be used within SiteProvider");
  return context;
}