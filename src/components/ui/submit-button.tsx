"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { Button } from "./button";
import { subscribeNever } from "@/lib/hotspot";

/**
 * Submit button that stays disabled until the page is interactive. On slow captive-portal links a
 * tap before hydration would submit the bare HTML form and silently reload the page.
 */
export function SubmitButton({ disabled, ...props }: Omit<ComponentProps<typeof Button>, "type">) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  return <Button type="submit" disabled={!hydrated || disabled} {...props} />;
}
