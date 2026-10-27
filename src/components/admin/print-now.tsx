"use client";

import { useEffect } from "react";

/** Opens the print dialog once when the receipt loads (?print=1), plus a manual button. */
export function PrintNow({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="no-print" style={{ display: "flex", gap: 8, justifyContent: "center", margin: "16px 0" }}>
      <button type="button" onClick={() => window.print()} style={{ height: 44, padding: "0 18px", border: 0, borderRadius: 8, background: "#1d5bd8", color: "#fff", fontWeight: 700, fontSize: 15 }}>
        Print receipt
      </button>
      <button type="button" onClick={() => history.back()} style={{ height: 44, padding: "0 18px", border: "1px solid #d3d8e0", borderRadius: 8, background: "#fff", fontSize: 15 }}>
        Back
      </button>
    </div>
  );
}
