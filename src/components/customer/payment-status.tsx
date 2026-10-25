"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeNever } from "@/lib/hotspot";
import type { PaymentDto } from "@/lib/types";
import { api, ApiError } from "@/lib/api-client";
import { formatPhone } from "@/lib/phone";
import { formatXaf } from "@/lib/format";
import { Alert, Card, Field, Input } from "@/components/ui/primitives";
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

  const [txn, setTxn] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setClaimError(null);
    if (txn.replace(/\s/g, "").length < 6) return setClaimError("Type the Transaction ID from the MTN SMS.");
    setClaiming(true);
    try {
      const res = await api<{ payment: PaymentDto }>(`/api/payments/${payment.id}/claim`, { body: { transactionId: txn } });
      setPayment(res.payment);
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : "Could not send the Transaction ID. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the code is on screen
    }
  }

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

      {payment.status === "PENDING" && payment.manual && !payment.manual.claimedAt ? (
        <div>
          <h1 className="text-center text-lg font-semibold">Pay {formatXaf(payment.amountXaf)} with MTN MoMo</h1>
          <ol className="mt-4 space-y-5">
            <li>
              <p className="text-sm font-medium text-ink">1. Dial this code on your MTN phone and enter your PIN</p>
              <p className="mt-2 rounded-md bg-surface px-3 py-3 text-center font-mono text-xl font-semibold tracking-wide text-ink select-all">{payment.manual.ussd}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a href={`tel:${encodeURIComponent(payment.manual.ussd)}`} className="inline-flex h-11 items-center justify-center rounded-md bg-[#ffcb05] text-sm font-semibold text-ink">
                  Dial now
                </a>
                <Button variant="secondary" onClick={() => copyCode(payment.manual!.ussd)}>
                  {copied ? "Copied" : "Copy code"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">
                It sends {formatXaf(payment.amountXaf)} to Juthelink (MTN {payment.manual.momoNumber}). If “Dial now” does nothing, open your phone app and type the code.
              </p>
            </li>
            <li>
              <form onSubmit={claim} noValidate>
                <Field label="2. Type the Transaction ID from the MTN SMS" htmlFor="txn" error={claimError ?? undefined} hint="MTN sends an SMS after the payment, with “Transaction ID” or “ID:”.">
                  <Input id="txn" value={txn} onChange={(e) => setTxn(e.target.value)} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="e.g. 9876543210" />
                </Field>
                <Button type="submit" size="lg" className="mt-3 w-full" loading={claiming}>
                  I have paid, confirm my payment
                </Button>
              </form>
            </li>
          </ol>
        </div>
      ) : payment.status === "PENDING" && payment.manual ? (
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <PhoneIcon className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Checking your payment</h1>
          <p className="mt-2 text-sm text-muted">
            Juthelink is confirming your MoMo payment of <strong className="text-ink">{formatXaf(payment.amountXaf)}</strong> (Transaction ID{" "}
            <span className="font-mono text-ink">{payment.manual.transactionId}</span>). This usually takes a few minutes.
          </p>
          <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm text-ink-soft">Keep this page open. As soon as it is confirmed, this phone is connected automatically.</p>
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
            <Spinner /> Waiting for confirmation…
          </p>
        </div>
      ) : payment.status === "PENDING" ? (
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
            {payment.status === "EXPIRED" && !payment.manual
              ? "The payment was not approved in time."
              : payment.status === "CANCELLED"
                ? "The payment was cancelled."
                : (payment.failureReason ?? "The payment was declined.")}{" "}
            {payment.manual ? "No access was granted. If you paid, contact us with your Transaction ID." : "No money was taken and no access was granted."}
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
