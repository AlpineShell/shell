"use client";

import { installDeepLink } from "../_lib/permissions";

export function InstallButton({ id, version }: { id: string; version: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <a
        href={installDeepLink(id, version)}
        className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 font-averia text-black transition hover:bg-gray-200"
      >
        Install in Alpine Shell
      </a>
      <p className="text-xs text-gray-500">
        Opens Alpine Shell. You confirm the install inside the app — nothing is
        installed from this page.
      </p>
    </div>
  );
}
