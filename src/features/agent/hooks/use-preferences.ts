"use client";
import { useCallback, useEffect, useState } from "react";
import type { Consent, UserPreferencesPatch, UserPreferencesWithSources } from "../schemas";
import { api, ApiCallError } from "./use-api";

/** Load preferences and persist each edit; touched fields become `user_set` server-side. */
export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferencesWithSources | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPrefs(await api<UserPreferencesWithSources>("/api/agent/preferences"));
    } catch {
      setError("Couldn't load your preferences.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (patch: UserPreferencesPatch) => {
    setError(null);
    setPrefs((p) => (p ? { ...p, ...patch, fieldSources: { ...p.fieldSources, ...touched(patch) } } : p));
    try {
      setPrefs(await api<UserPreferencesWithSources>("/api/agent/preferences", { method: "PATCH", body: patch }));
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : "Couldn't save that change.");
      await reload();
    }
  }, [reload]);

  return { prefs, error, update, reload };
}

function touched(patch: UserPreferencesPatch) {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, "user_set" as const]));
}

export function usePermissions() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Consent>("/api/agent/permissions").then(setConsent, () => setError("Couldn't load your permissions."));
  }, []);

  const update = useCallback(async (patch: Partial<Consent>) => {
    setError(null);
    setConsent((c) => (c ? { ...c, ...patch } : c));
    try {
      setConsent(await api<Consent>("/api/agent/permissions", { method: "PATCH", body: patch }));
    } catch {
      setError("Couldn't save that change.");
      setConsent(await api<Consent>("/api/agent/permissions").catch(() => null));
    }
  }, []);

  return { consent, error, update };
}
