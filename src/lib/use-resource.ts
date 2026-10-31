"use client";

import { useCallback, useEffect, useState } from "react";

/** Pass a stable module-level loader, or wrap a parameterized loader in useCallback. */
export function useResource<T>(loader: () => Promise<T>) {
  const [owner, setOwner] = useState<(() => Promise<T>) | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setRevision((value) => value + 1); }, []);
  useEffect(() => { window.addEventListener("loopledger:refresh", refresh); return () => window.removeEventListener("loopledger:refresh", refresh); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(loader).then((result) => {
      if (!cancelled) { setOwner(() => loader); setData(result); setError(null); setLoading(false); }
    }).catch((reason: unknown) => {
      if (!cancelled) { setOwner(() => loader); setError(reason instanceof Error ? reason.message : "Unable to load data"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [loader, revision]);
  return { data: owner === loader ? data : null, error: owner === loader ? error : null, loading: loading || owner !== loader, refresh };
}
