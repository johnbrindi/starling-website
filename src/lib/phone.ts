// Cameroon phone handling (client-safe). Mobile numbers are 9 digits starting with 6.

export type Operator = "MTN" | "ORANGE";

/** Normalises "6 70 00 00 00", "670000000", "+237670000000", "00237670000000" to E.164, or null. */
export function normalizeCameroonPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("237") && digits.length === 12) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) return null;
  return `+237${digits}`;
}

/**
 * Best-effort operator guess from the number prefix. Number portability exists, so the
 * customer can always change the selection in the UI.
 */
export function guessOperator(e164: string): Operator | null {
  const local = e164.replace(/^\+237/, "");
  const p2 = local.slice(0, 2);
  const p3 = Number(local.slice(0, 3));
  if (p2 === "67") return "MTN";
  if (p2 === "69") return "ORANGE";
  if (p3 >= 650 && p3 <= 654) return "MTN";
  if (p3 >= 655 && p3 <= 659) return "ORANGE";
  if (p3 >= 680 && p3 <= 684) return "MTN";
  if (p3 >= 685 && p3 <= 689) return "ORANGE";
  return null;
}

export function formatPhone(e164: string): string {
  const local = e164.replace(/^\+237/, "");
  return `+237 ${local.slice(0, 1)} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}
