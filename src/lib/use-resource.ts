"use client";

import { useCallback, useEffect, useState } from "react";

/** Pass a stable module-level loader, or wrap a parameterized loader in useCallback. */
export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setRevision((value) => value + 1); }, []);
  useEffect(() => { window.addEventListener("loopledger:refresh", refresh); return () => window.removeEventListener("loopledger:refresh", refresh); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    loader().then((result) => {
      if (!cancelled) { setData(result); setError(null); setLoading(false); }
    }).catch((reason: unknown) => {
      if (!cancelled) { setError(reason instanceof Error ? reason.message : "Unable to load data"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [loader, revision]);
  return { data, error, loading, refresh };
}
