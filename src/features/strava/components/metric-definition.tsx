"use client";

import { useEffect, useId, useState } from "react";

export function MetricDefinition({ title, definition }: { title: string; definition: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  return <div className="relative flex items-center gap-2"
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <h2 className="text-xl font-semibold">{title}</h2>
    <button type="button" aria-label={`${title} · ?`} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-stone-300 text-xs font-semibold text-stone-600 focus-visible:outline-2">
      ?
    </button>
    {open && <span id={id} role="tooltip"
      className="absolute left-0 top-full z-30 w-72 max-w-full rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700 shadow-lg">
      {definition}
    </span>}
  </div>;
}
