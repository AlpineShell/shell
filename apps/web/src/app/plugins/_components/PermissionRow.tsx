import { PERMISSION_META } from "../_lib/permissions";
import { RiskBadge } from "./RiskBadge";

export function PermissionRow({
  token,
  reason,
}: {
  token: string;
  reason?: string;
}) {
  const meta = PERMISSION_META[token];
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-white">
          {meta ? meta.label : token}
        </p>
        <p className="mt-1 text-sm text-gray-400">
          {meta ? meta.description : "This plugin requests a permission Alpine Shell does not recognize."}
        </p>
        {reason && (
          <p className="mt-2 text-sm text-gray-300">
            <span className="text-gray-500">Why: </span>
            {reason}
          </p>
        )}
        <p className="mt-2 font-mono text-xs text-gray-600">{token}</p>
      </div>
      <div className="shrink-0">
        <RiskBadge risk={meta ? meta.risk : "unknown"} />
      </div>
    </li>
  );
}
