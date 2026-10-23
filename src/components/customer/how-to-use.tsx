import { formatAccessCode } from "@/lib/format";

/** Plain-language guide for what to do with an access code. */
export function HowToUse({
  username,
  password,
  maxDevices,
  networkName,
}: {
  username: string;
  password: string;
  maxDevices: number;
  networkName: string;
}) {
  const userpass = username !== password;
  const shown = userpass ? (
    <>
      username <strong className="font-mono text-ink">{username}</strong> and password <strong className="font-mono text-ink">{password}</strong>
    </>
  ) : (
    <strong className="font-mono text-ink">{formatAccessCode(username)}</strong>
  );
  const steps: [string, React.ReactNode][] = [
    ["Stay on the Wi-Fi", <>Make sure your phone is connected to the <strong className="text-ink">{networkName}</strong> network (not mobile data), with “private Wi-Fi address” turned off (see above).</>],
    ["Tap “Connect this device”", <>Use the blue button above. The Wi-Fi logs you in and you can browse straight away.</>],
    [
      "On another phone or laptop",
      <>
        Join <strong className="text-ink">{networkName}</strong>, open any website (for example <span className="font-mono">neverssl.com</span>). On the login page, type {shown} and tap Connect. Your pass allows {maxDevices} device{maxDevices > 1 ? "s" : ""} at the same time; a device keeps its place until your time ends.
      </>,
    ],
    ["Watch your time", <>The countdown runs even when you are not browsing. We remind you before it ends; buy more time to keep the same code.</>],
  ];
  return (
    <section className="rounded-xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold sm:px-5">{userpass ? "How to use your Wi-Fi login" : "How to use your access code"}</h2>
      <ol className="space-y-4 px-4 py-4 sm:px-5">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{i + 1}</span>
            <div className="text-sm leading-6 text-ink-soft">
              <p className="font-medium text-ink">{title}</p>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t border-line bg-surface px-4 py-3 text-xs text-muted sm:px-5">
        Every code is unique and belongs to your account only. Keep it private: anyone who has it can use your time.
      </p>
    </section>
  );
}
