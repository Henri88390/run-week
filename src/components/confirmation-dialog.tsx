"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmationDialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel, tone = "default", busy = false }: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      aria-busy={busy}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-stone-300 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/40">
      <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
      <div id={descriptionId} className="mt-3 space-y-3 text-sm leading-6 text-stone-600">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" ref={cancel} className="button-secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" disabled={busy} className={tone === "danger"
          ? "button-primary border-red-700 bg-red-700 hover:bg-red-800"
          : "button-primary"} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
