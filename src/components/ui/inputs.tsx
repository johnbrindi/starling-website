"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./primitives";

/** Cameroon mobile number with a fixed +237 prefix and a numeric keypad. */
export function PhoneInput({ invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <div className={`flex rounded-md ${invalid ? "ring-1 ring-bad" : ""}`}>
      <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-line bg-surface px-3 text-base text-muted">+237</span>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="6 70 00 00 00"
        className="rounded-l-none"
        aria-invalid={invalid || undefined}
        {...props}
      />
    </div>
  );
}

/** Password field with a show/hide toggle (easier to type correctly on a phone). */
export function PasswordInput({ invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={`pr-16 ${invalid ? "border-bad" : ""}`} aria-invalid={invalid || undefined} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-brand-700"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
