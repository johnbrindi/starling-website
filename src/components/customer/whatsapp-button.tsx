"use client";

import { useState } from "react";

/**
 * Floating "contact us" button (shown only when a WhatsApp number is set in Settings).
 * Before login the Wi-Fi only allows this website, and the phone's "Sign in to Wi-Fi" window cannot
 * open wa.me pages. So it offers the WhatsApp app link (the app can use mobile data), a call link,
 * and the number to copy, which always work.
 */
export function WhatsAppButton({ number, businessName }: { number: string; businessName: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const digits = number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const text = encodeURIComponent(`Hello ${businessName}, I need help with my Wi-Fi.`);
  const pretty = `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`.trim();

  async function copy() {
    try {
      await navigator.clipboard.writeText(`+${digits}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the number is shown
    }
  }

  const item = "flex h-11 items-center justify-center rounded-md text-sm font-semibold";
  return (
    <>
      {open ? (
        <div role="dialog" aria-label="Contact us" className="fixed bottom-36 right-4 z-40 w-64 rounded-lg border border-line bg-white p-3 shadow-lg sm:bottom-24">
          <p className="text-sm font-semibold text-ink">Contact {businessName}</p>
          <p className="mt-0.5 font-mono text-base text-ink">{pretty}</p>
          <div className="mt-3 grid gap-2">
            <a href={`whatsapp://send?phone=${digits}&text=${text}`} className={`${item} bg-[#25D366] text-white`}>Open WhatsApp</a>
            <a href={`tel:+${digits}`} className={`${item} border border-line text-ink`}>Call us</a>
            <button type="button" onClick={copy} className={`${item} border border-line text-ink`}>{copied ? "Number copied" : "Copy number"}</button>
          </div>
          <p className="mt-2 text-xs text-muted">Not connected yet? Turn on mobile data for WhatsApp, or copy the number and message us.</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Contact us on WhatsApp"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md sm:bottom-6"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.8.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z" />
        </svg>
      </button>
    </>
  );
}
