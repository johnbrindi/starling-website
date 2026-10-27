import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { credentialPassword } from "@/server/subscriptions/service";
import { formatDuration, formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PrintNow } from "@/components/admin/print-now";

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" }).format(d);

/**
 * Printable customer receipt for one login: only the slip prints (58/80 mm thermal or A4),
 * never the admin page around it.
 */
export default async function ReceiptPage(props: PageProps<"/admin/receipt/[id]">) {
  await requireStaffPage("customers:view");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const cred = await db.accessCredential.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, phone: true } },
      package: { select: { name: true, durationMinutes: true, priceXaf: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { package: { select: { name: true, durationMinutes: true } }, payment: { select: { reference: true, amountXaf: true, provider: true, createdAt: true } } } },
    },
  });
  if (!cred) notFound();
  const settings = await getSettings();
  const sub = cred.subscriptions[0];
  const planName = sub?.package.name ?? cred.package?.name ?? "Wi-Fi pass";
  const minutes = cred.durationMinutes ?? sub?.durationMinutes ?? cred.package?.durationMinutes ?? null;
  const amount = sub?.payment?.amountXaf ?? cred.priceXaf ?? cred.package?.priceXaf ?? null;
  const waitingFirstLogin = cred.startsOnFirstLogin && !cred.firstLoginAt;
  const password = credentialPassword(cred);
  const paidBy = sub?.payment?.provider === "CASH" ? "Cash" : sub?.payment?.provider === "MANUAL" ? "MTN MoMo" : sub?.payment ? "Mobile Money" : null;

  return (
    <div className="rc-wrap">
      <style>{`
        @page { size: auto; margin: 4mm; }
        .rc-wrap { background: #f5f6f8; min-height: 100vh; padding: 16px 0; }
        @media print { .no-print { display: none !important; } body, html, .rc-wrap { background: #fff !important; padding: 0 !important; min-height: 0 !important; } .receipt { box-shadow: none !important; border: 0 !important; margin: 0 !important; } }
        .receipt { width: 72mm; max-width: 100%; margin: 0 auto; background: #fff; color: #000; font-family: system-ui, Arial, sans-serif; padding: 5mm 4mm; border: 1px solid #e1e4ea; border-radius: 6px; }
        .receipt h1 { font-size: 18px; margin: 0; text-align: center; }
        .receipt .c { text-align: center; }
        .receipt .muted { color: #444; font-size: 11px; }
        .receipt hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
        .receipt .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
        .receipt .row b { text-align: right; }
        .receipt .big { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 22px; font-weight: 700; letter-spacing: 1px; text-align: center; margin: 2px 0 6px; }
        .receipt .lbl { font-size: 11px; text-align: center; color: #333; text-transform: uppercase; letter-spacing: .06em; }
      `}</style>
      <PrintNow auto={sp.print === "1"} />
      <div className="receipt">
        <h1>{settings.businessName}</h1>
        <p className="c muted">Wi-Fi receipt</p>
        <hr />
        <p className="lbl">Username</p>
        <p className="big">{cred.username}</p>
        <p className="lbl">Password</p>
        <p className="big">{password}</p>
        <hr />
        <div className="row"><span>Plan</span><b>{planName}{minutes ? ` (${formatDuration(minutes)})` : ""}</b></div>
        {amount !== null ? <div className="row"><span>Amount</span><b>{formatXaf(amount)}</b></div> : null}
        {paidBy ? <div className="row"><span>Paid by</span><b>{paidBy}</b></div> : null}
        <div className="row"><span>Activated</span><b>{waitingFirstLogin ? "At first login" : fmt(cred.validFrom)}</b></div>
        <div className="row"><span>Expires</span><b>{waitingFirstLogin ? (minutes ? `${formatDuration(minutes)} after first login` : "—") : fmt(cred.validUntil)}</b></div>
        <div className="row"><span>Devices</span><b>{cred.maxDevices}</b></div>
        {cred.customer ? <div className="row"><span>Customer</span><b>{cred.customer.name ?? formatPhone(cred.customer.phone)}</b></div> : null}
        {sub?.payment ? <div className="row"><span>Ref</span><b style={{ fontSize: 10 }}>{sub.payment.reference}</b></div> : null}
        <div className="row"><span>Printed</span><b>{fmt(new Date())}</b></div>
        <hr />
        <p className="muted">1. Connect to the Wi-Fi. 2. Open any website: the login page appears. 3. Enter the username and password, tap Connect.</p>
        <p className="muted">One device at a time. Keep this receipt.{settings.supportWhatsapp ? ` Help: WhatsApp ${settings.supportWhatsapp}` : ""}</p>
      </div>
    </div>
  );
}
