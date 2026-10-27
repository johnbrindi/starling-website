// DTOs shared between server responses and client components (all dates are ISO strings in UTC).

export interface PackageDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceXaf: number;
  effectivePriceXaf: number;
  promoActive: boolean;
  durationMinutes: number;
  dataLimitMb: number | null;
  rateLimit: string | null;
  maxDevices: number;
  /** From the MikroTik rate limit ("upload/download"), e.g. "4 Mbps"; null = no per-user cap. */
  downloadSpeed: string | null;
  uploadSpeed: string | null;
  usagePolicy: string;
  isFeatured: boolean;
}

export type PaymentStatusDto = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED" | "REFUNDED";

export interface PaymentDto {
  id: string;
  reference: string;
  status: PaymentStatusDto;
  amountXaf: number;
  packageName: string;
  channel: string | null;
  payerPhone: string;
  isSimulated: boolean;
  failureReason: string | null;
  createdAt: string;
  expiresAt: string;
  /** Manual MTN MoMo payment: what to dial, and the transaction ID once the customer submitted it. */
  manual: { momoNumber: string; ussd: string; transactionId: string | null; claimedAt: string | null; hasScreenshot: boolean } | null;
}

export type AccessState = "NONE" | "PROVISIONING" | "READY" | "ONLINE" | "SCHEDULED" | "EXPIRED" | "REVOKED" | "PAUSED";

export interface AccessStatusDto {
  serverTime: string;
  state: AccessState;
  credential: {
    /** Hotspot username. For "code" style it equals the password (one code to type). */
    username: string;
    password: string;
    style: "code" | "userpass";
    validFrom: string;
    validUntil: string;
    status: "ACTIVE" | "EXPIRED" | "REVOKED";
    provisionState: string;
    maxDevices: number;
    dataLimitBytes: string | null;
    bytesUsed: string;
  } | null;
  activeSessions: { macAddress: string | null; ipAddress: string | null; startedAt: string }[];
  warningMinutes: number[];
  hotspotLoginUrl: string;
}
