"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeNever } from "@/lib/hotspot";
import type { PaymentDto } from "@/lib/types";
import { api, ApiError } from "@/lib/api-client";
import { formatPhone } from "@/lib/phone";
import { formatXaf } from "@/lib/format";
import { Alert, Card } from "@/components/ui/primitives";
import { Button, LinkButton, Spinner } from "@/components/ui/button";
import { CheckIcon, PhoneIcon } from "@/components/ui/icons";

export function PaymentStatus({ initial, devSimulator }: { initial: PaymentDto; devSimulator: boolean }) {
  const router = useRouter();
  const [payment, setPayment] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const instructions = useSyncExternalStore(subscribeNever, () => sessionStorage.getItem(`pay:${initial.id}`), () => null);
  const [deciding, setDeciding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poll = useCallback(async () => {
    try {
      const res = await api<{ payment: PaymentDto }>(`/api/payments/${initial.id}`);
      setPayment(res.payment);
      setError(null);
      return res.payment.status;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not check the payment.");
      return "PENDING";
    }
  }, [initial.id]);

  useEffect(() => {
    if (payment.status !== "PENDING") return;
    let attempt = 0;
    const loop = async () => {
      const status = await poll();
      attempt++;
      if (status === "PENDING") timer.current = setTimeout(loop, attempt < 20 ? 3000 : 8000);
    };
    timer.current = setTimeout(loop, 2500);
    return () => clearTimeout(timer.current);
  }, [payment.status, poll]);

  useEffect(() => {
    if (payment.status === "SUCCEEDED") {
      const t = setTimeout(() => router.push("/account?paid=1"), 1500);
      return () => clearTimeout(t);
    }
  }, [payment.status, router]);

  async function decide(decision: "succeeded" | "failed") {
    setDeciding(true);
    try {
      await api(`/api/dev/simulator/${payment.id}`, { body: { decision } });
      await poll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Simulator error");
    } finally {
      setDeciding(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      {payment.isSimulated ? (
        <div className="mb-4">
          <Alert tone="warn" title="Simulated payment">No real money is involved. This screen exists only in test mode.</Alert>
        </div>
      ) : null}

      {payment.status === "PENDING" ? (
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <PhoneIcon className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Approve the payment on your phone</h1>
          <p className="mt-2 text-sm text-muted">
            We sent a request of <strong className="text-ink">{formatXaf(payment.amountXaf)}</strong> to {formatPhone(payment.payerPhone)}. Enter your Mobile
            Money PIN on your phone to confirm.
          </p>
          {instructions ? <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm text-ink-soft">{instructions}</p> : null}
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
            <Spinner /> Waiting for confirmation…
          </p>
          {devSimulator && payment.isSimulated ? (
            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-4">
              <Button variant="secondary" onClick={() => decide("failed")} loading={deciding}>
                Simulate decline
              </Button>
              <Button onClick={() => decide("succeeded")} loading={deciding}>
                Simulate approve
              </Button>
            </div>
          ) : null}
        </div>
      ) : payment.status === "SUCCEEDED" ? (
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok">
            <CheckIcon className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Payment confirmed</h1>
          <p className="mt-2 text-sm text-muted">Your {payment.packageName} pass is ready. Opening your access code…</p>
          <LinkButton href="/account" className="mt-5">
            Show my access code
          </LinkButton>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-lg font-semibold">Payment not completed</h1>
          <p className="mt-2 text-sm text-muted">
            {payment.status === "EXPIRED"
              ? "The payment was not approved in time."
              : payment.status === "CANCELLED"
                ? "The payment was cancelled."
                : (payment.failureReason ?? "The payment was declined.")}{" "}
            No money was taken and no access was granted.
          </p>
          <LinkButton href="/plans" className="mt-5">
            Try again
          </LinkButton>
        </div>
      )}
      {error ? <p className="mt-4 text-center text-sm text-bad">{error}</p> : null}
      <p className="mt-6 text-center text-xs text-muted">Reference {payment.reference}</p>
    </Card>
  );
}
