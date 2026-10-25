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
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setClaimError(null);
    const id = txn.replace(/\s/g, "");
    if (!shot && id.length < 6) return setClaimError("Type the Transaction ID from the MTN SMS, or add a screenshot of the payment.");
    setClaiming(true);
    try {
      const body = new FormData();
      if (id) body.set("transactionId", id);
      if (shot) body.set("screenshot", shot.blob, "payment.jpg");
      const res = await api<{ payment: PaymentDto }>(`/api/payments/${payment.id}/claim`, { body });
      setPayment(res.payment);
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : "Could not send the Transaction ID. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  async function pickScreenshot(file: File | undefined) {
    setClaimError(null);
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await shrinkImage(file);
      if (blob.size > 2_000_000) throw new Error("too big");
      if (shot) URL.revokeObjectURL(shot.url);
      setShot({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setClaimError("Could not use this picture. Choose a screenshot (JPG or PNG) under 2 MB.");
    } finally {
      setPreparing(false);
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
                <p className="text-sm font-medium text-ink">2. Show us your payment (one of these is enough)</p>
                <div className="mt-2 space-y-3 rounded-md border border-line p-3">
                  <Field label="Transaction ID from the MTN SMS" htmlFor="txn" hint="MTN sends an SMS after the payment, with “Transaction ID” or “ID:”.">
                    <Input id="txn" value={txn} onChange={(e) => setTxn(e.target.value)} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="e.g. 9876543210" />
                  </Field>
                  <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted">
                    <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                  </div>
                  <div>
                    <label htmlFor="shot" className="flex h-11 cursor-pointer items-center justify-center rounded-md border border-dashed border-brand-600 text-sm font-semibold text-brand-700">
                      {preparing ? "Preparing…" : shot ? "Change screenshot" : "Add a screenshot of the payment"}
                    </label>
                    <input id="shot" type="file" accept="image/*" className="sr-only" onChange={(e) => pickScreenshot(e.target.files?.[0])} />
                    {shot ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local preview of the customer's own file
                      <img src={shot.url} alt="Your payment screenshot" className="mt-2 max-h-48 w-full rounded-md border border-line object-contain" />
                    ) : null}
                  </div>
                </div>
                {claimError ? <p className="mt-2 text-sm text-bad">{claimError}</p> : null}
                <Button type="submit" size="lg" className="mt-3 w-full" loading={claiming} disabled={preparing}>
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
            Juthelink is confirming your MoMo payment of <strong className="text-ink">{formatXaf(payment.amountXaf)}</strong>
            {payment.manual.transactionId ? <> (Transaction ID <span className="font-mono text-ink">{payment.manual.transactionId}</span>)</> : payment.manual.hasScreenshot ? " (screenshot received)" : null}. This usually takes a few minutes.
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

/** Downscales a photo/screenshot to at most 1600 px and re-encodes it as JPEG (keeps uploads small on slow Wi-Fi). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
