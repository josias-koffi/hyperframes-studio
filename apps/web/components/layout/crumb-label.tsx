"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CrumbContext = createContext<{ label: string | null; setLabel: (label: string | null) => void }>({
  label: null,
  setLabel: () => {},
});

export function CrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <CrumbContext.Provider value={{ label, setLabel }}>{children}</CrumbContext.Provider>;
}

export function useCrumbLabel() {
  return useContext(CrumbContext).label;
}

/** Rendered by a detail page to name its id segment in the header breadcrumb. */
export function CrumbLabel({ label }: { label: string }) {
  const { setLabel } = useContext(CrumbContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
  return null;
}
