import type { Metadata } from "next";
import Link from "next/link";
import { DOCS_GROUPS, DOCS_NAV, DOCS_SECTIONS } from "./_lib/nav";

export const metadata: Metadata = {
  title: "Docs · Alpine Shell",
  description: "Guides and reference for extending Alpine Shell.",
};

export default function DocsIndexPage() {
  return (
    <div>
      <h1 className="font-averia text-4xl font-semibold tracking-tight">
        Documentation
      </h1>
      <p className="mt-3 max-w-xl text-lg text-gray-400">
        Guides and reference for extending Alpine Shell.
      </p>
      {DOCS_SECTIONS.map((section) => (
        <section key={section} className="mt-12">
          <h2 className="font-averia text-2xl font-semibold tracking-tight">
            {section}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {DOCS_GROUPS.flatMap((group) =>
              DOCS_NAV.filter(
                (entry) => entry.section === section && entry.group === group,
              ),
            ).map((entry) => (
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
        </section>
      ))}
    </div>
  );
}
