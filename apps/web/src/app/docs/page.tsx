import type { Metadata } from "next";
import Link from "next/link";
import { DOCS_NAV } from "./_lib/nav";

export const metadata: Metadata = {
  title: "Docs — Alpine Shell",
  description: "Everything you need to build and ship an Alpine Shell plugin.",
};

export default function DocsIndexPage() {
  return (
    <div>
      <h1 className="font-averia text-4xl font-semibold tracking-tight">
        Plugin documentation
      </h1>
      <p className="mt-3 max-w-xl text-lg text-gray-400">
        A plugin is a folder that contributes widgets, settings pages and
        launcher commands. Write a custom plugin and drop it in, or install an
        official one from the marketplace in a click. Start with your first
        plugin, then dig into the manifest and SDK.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {DOCS_NAV.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/docs/${entry.slug}`}
              className="flex h-full flex-col rounded-xl bg-white/5 p-5 transition hover:bg-white/10"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {entry.group}
              </span>
              <span className="mt-2 font-averia text-lg text-white">
                {entry.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
