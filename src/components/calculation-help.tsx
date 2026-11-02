"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function CalculationHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const triggerButton = button.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      triggerButton?.focus();
    };
  }, [open]);
  return <>
    <button ref={button} type="button" className="calculation-help-button" aria-label={`How is ${label} calculated?`} aria-haspopup="dialog" onClick={() => setOpen(true)}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.4" /><path d="M6.5 6a1.6 1.6 0 0 1 3.1.5c0 1-1.6 1.3-1.6 2.4M8 11.3h.01" /></svg></button>
    {open && createPortal(<div className="calculation-help-backdrop" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="calculation-help-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <div className="calculation-help-heading"><div><p className="eyebrow">HOW IT’S CALCULATED</p><h2 id={titleId}>{label}</h2></div><button ref={closeButton} type="button" className="calculation-help-close" aria-label="Close calculation explanation" onClick={() => setOpen(false)}>×</button></div>
        <div id={bodyId} className="calculation-help-body">{children}</div>
      </section>
    </div>, document.body)}
  </>;
}

export function ExplainedValue({ label, explanation }: { label: string; explanation: ReactNode }) {
  return <span className="explained-label"><span className="explained-label-text">{label}</span><CalculationHelp label={label}>{explanation}</CalculationHelp></span>;
}
