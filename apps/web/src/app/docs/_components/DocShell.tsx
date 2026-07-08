import Link from "next/link";
import { DOCS_NAV } from "../_lib/nav";

export function DocShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const index = DOCS_NAV.findIndex((entry) => entry.slug === slug);
  const prev = index > 0 ? DOCS_NAV[index - 1] : null;
  const next =
    index >= 0 && index < DOCS_NAV.length - 1 ? DOCS_NAV[index + 1] : null;

  return (
    <article className="min-w-0">
      {children}
      <nav className="mt-16 flex justify-between gap-4 border-t border-white/10 pt-6 text-sm">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="text-gray-400 transition hover:text-white"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="text-right text-gray-400 transition hover:text-white"
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
