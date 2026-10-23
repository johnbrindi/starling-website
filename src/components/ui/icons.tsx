// Minimal inline icon set (stroke icons, 24px grid). Decorative unless a label is given.
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />;
}

export const WifiIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 8.5a15 15 0 0 1 20 0" />
    <path d="M5.5 12a10 10 0 0 1 13 0" />
    <path d="M9 15.5a5 5 0 0 1 6 0" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </Icon>
);
export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m5 12 4.5 4.5L19 7" />
  </Icon>
);
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2" />
    <path d="M11 18h2" />
  </Icon>
);
export const DevicesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="13" height="10" rx="1.5" />
    <path d="M7 19h5" />
    <rect x="17" y="9" width="4" height="10" rx="1" />
  </Icon>
);
export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
  </Icon>
);
export const TicketIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8Z" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </Icon>
);
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </Icon>
);
