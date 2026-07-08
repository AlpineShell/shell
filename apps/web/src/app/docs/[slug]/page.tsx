import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS_NAV } from "../_lib/nav";
import { loadDoc } from "../_lib/loadDoc";
import { Markdown } from "../_lib/Markdown";
import { DocShell } from "../_components/DocShell";

export function generateStaticParams() {
  return DOCS_NAV.map((entry) => ({ slug: entry.slug }));
}

type DocParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: DocParams): Promise<Metadata> {
  const { slug } = await params;
  const entry = DOCS_NAV.find((doc) => doc.slug === slug);
  return { title: entry ? `${entry.title} — Alpine Shell Docs` : "Docs — Alpine Shell" };
}

export default async function DocPage({ params }: DocParams) {
  const { slug } = await params;
  if (!DOCS_NAV.some((doc) => doc.slug === slug)) notFound();
  const source = await loadDoc(slug);
  return (
    <DocShell slug={slug}>
      <Markdown source={source} />
    </DocShell>
  );
}
