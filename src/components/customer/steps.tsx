/** Purchase progress: Account → Choose → Pay → Connect. */
const STEPS = ["Account", "Choose pass", "Pay", "Connect"];

export function PurchaseSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Purchase progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        return (
          <li key={label} className="min-w-0">
            <div className={`h-1.5 rounded-full ${state === "todo" ? "bg-line" : "bg-brand-600"}`} />
            <p className={`mt-1.5 truncate text-xs ${state === "now" ? "font-semibold text-ink" : "text-muted"}`} aria-current={state === "now" ? "step" : undefined}>
              {n}. {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
