"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

const CsrfContext = createContext<string>("");

export function AdminProvider({ csrf, children }: { csrf: string; children: ReactNode }) {
  return <CsrfContext.Provider value={csrf}>{children}</CsrfContext.Provider>;
}

/** API caller that attaches the staff CSRF token. */
export function useAdminApi() {
  const csrf = useContext(CsrfContext);
  return <T,>(path: string, init: { method?: string; body?: unknown } = {}) => api<T>(path, { ...init, csrf });
}

/** A button that performs one admin API call, optionally after confirmation and with a reason prompt. */
export function ActionButton({
  path,
  method = "POST",
  body = {},
  label,
  confirm,
  askReason,
  variant = "secondary",
  size = "sm",
  showResult,
}: {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  label: string;
  confirm?: string;
  askReason?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  showResult?: boolean;
}) {
  const call = useAdminApi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    let payload = body;
    if (askReason) {
      const reason = window.prompt(askReason);
      if (!reason || reason.trim().length < 3) return;
      payload = { ...body, reason: reason.trim() };
    } else if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await call<Record<string, unknown>>(path, { method, body: payload });
      if (showResult) setMsg(JSON.stringify(res.result ?? res, null, 2));
      router.refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <Button variant={variant} size={size} onClick={run} loading={busy}>
        {label}
      </Button>
      {msg ? <pre className="mt-1 max-h-64 max-w-full overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-xs text-ink-soft">{msg}</pre> : null}
    </span>
  );
}
