/** Phones hide their real Wi-Fi address by default; the hotspot needs it to keep a device logged in. */
export function DeviceMacHelp({ networkName, open = false }: { networkName: string; open?: boolean }) {
  return (
    <details className="group rounded-xl border border-line bg-white px-4 py-3 text-sm sm:px-5" open={open}>
      <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
        <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90">›</span>
        Logged out often or can&apos;t connect? Turn off “private Wi-Fi address”
      </summary>
      <div className="mt-3 space-y-2 text-ink-soft">
        <p>Phones use a random Wi-Fi address by default. The Wi-Fi then thinks you are a new device and asks you to log in again. Do this once:</p>
        <ul className="space-y-1.5">
          <li>
            <strong className="text-ink">Android:</strong> Settings → Wi-Fi → gear icon next to <strong className="text-ink">{networkName}</strong> → Privacy (or MAC address type) →{" "}
            <strong className="text-ink">Use device MAC</strong>.
          </li>
          <li>
            <strong className="text-ink">iPhone:</strong> Settings → Wi-Fi → ⓘ next to <strong className="text-ink">{networkName}</strong> → turn off{" "}
            <strong className="text-ink">Private Wi-Fi Address</strong>.
          </li>
        </ul>
        <p>Then forget and rejoin the network. This does not share any personal information.</p>
      </div>
    </details>
  );
}
