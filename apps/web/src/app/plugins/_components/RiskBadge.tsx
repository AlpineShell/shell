import type { PermissionRisk } from "../_lib/permissions";
import { RISK_LABEL } from "../_lib/permissions";

const RISK_STYLES: Record<PermissionRisk | "unknown", string> = {
  auto: "border-white/15 bg-white/5 text-gray-300",
  read: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  control: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  sensitive: "border-red-400/30 bg-red-400/10 text-red-200",
  node: "border-red-400/40 bg-red-500/15 text-red-200",
  unknown: "border-red-400/40 bg-red-500/15 text-red-200",
};

export function RiskBadge({ risk }: { risk: PermissionRisk | "unknown" }) {
  const label = risk === "unknown" ? "Unknown" : RISK_LABEL[risk];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RISK_STYLES[risk]}`}
    >
      {label}
    </span>
  );
}
