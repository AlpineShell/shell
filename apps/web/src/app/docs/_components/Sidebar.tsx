"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_GROUPS, DOCS_NAV, DOCS_SECTIONS } from "../_lib/nav";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-28 space-y-8">
        {DOCS_SECTIONS.map((section) => (
          <div key={section}>
            <p className="mb-3 text-sm font-semibold text-white">{section}</p>
            <div className="space-y-6">
              {DOCS_GROUPS.map((group) => {
                const entries = DOCS_NAV.filter(
                  (entry) => entry.section === section && entry.group === group,
                );
                if (entries.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group}
                    </p>
                    <ul className="space-y-1">
                      {entries.map((entry) => {
                        const href = `/docs/${entry.slug}`;
                        const active = pathname === href;
                        return (
                          <li key={entry.slug}>
                            <Link
                              href={href}
                              className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                                active
                                  ? "bg-white/10 font-medium text-white"
                                  : "text-gray-400 hover:text-white"
                              }`}
                            >
                              {entry.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
