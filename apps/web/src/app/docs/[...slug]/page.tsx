import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS_NAV } from "../_lib/nav";
import { loadDoc } from "../_lib/loadDoc";
import { Markdown } from "../_lib/Markdown";
import { DocShell } from "../_components/DocShell";

export function generateStaticParams() {
  return DOCS_NAV.map((entry) => ({ slug: entry.slug.split("/") }));
}

type DocParams = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({
  params,
}: DocParams): Promise<Metadata> {
  const { slug } = await params;
  const docPath = slug.join("/");
  const entry = DOCS_NAV.find((doc) => doc.slug === docPath);
  return { title: entry ? `${entry.title} · Alpine Shell Docs` : "Docs · Alpine Shell" };
}

export default async function DocPage({ params }: DocParams) {
  const { slug } = await params;
  const docPath = slug.join("/");
  if (!DOCS_NAV.some((doc) => doc.slug === docPath)) notFound();
  const source = await loadDoc(docPath);
  return (
    <DocShell slug={docPath}>
      <Markdown source={source} />
    </DocShell>
  );
}
