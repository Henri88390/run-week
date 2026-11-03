"use client";

import { useId } from "react";
import type { Messages } from "@/features/i18n/messages/en";

export function GarminHelp({ t }: { t: Messages["garmin"] }) {
  const id = useId();
  const titleId = `${id}-title`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={t.helpLabel}
        title={t.helpLabel}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
      >
        ?
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-700 shadow-lg backdrop:bg-stone-950/20"
      >
        <h3 id={titleId} className="font-semibold text-stone-900">{t.helpTitle}</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {t.helpItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="mt-4 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
        >
          {t.helpClose}
        </button>
      </div>
    </>
  );
}
