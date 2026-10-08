"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Labels = Record<string, string>;

const CrumbContext = createContext<{ labels: Labels; setLabel: (segment: string, label: string | null) => void }>({
  labels: {},
  setLabel: () => {},
});

export function CrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Labels>({});
  const setLabel = useCallback(
    (segment: string, label: string | null) =>
      setLabels((current) => {
        const next = { ...current };
        if (label === null) delete next[segment];
        else next[segment] = label;
        return next;
      }),
    [],
  );
  return <CrumbContext.Provider value={{ labels, setLabel }}>{children}</CrumbContext.Provider>;
}

/** Labels published by detail pages, keyed by the path segment they name (an id). */
export function useCrumbLabels() {
  return useContext(CrumbContext).labels;
}

/** Rendered by a detail page to name its id segment in the header breadcrumb. */
export function CrumbLabel({ segment, label }: { segment: string; label: string }) {
  const { setLabel } = useContext(CrumbContext);
  useEffect(() => {
    setLabel(segment, label);
    return () => setLabel(segment, null);
  }, [segment, label, setLabel]);
  return null;
}
