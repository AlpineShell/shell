"use client";

import { installDeepLink } from "../_lib/permissions";

export function InstallButton({ id, version }: { id: string; version: string }) {
  return (
    <a
      href={installDeepLink(id, version)}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-2.5 font-averia text-black transition hover:bg-gray-200"
    >
      Install in Alpine Shell
    </a>
  );
}
