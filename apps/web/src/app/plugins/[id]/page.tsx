import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { Markdown } from "../../docs/_lib/Markdown";
import { fetchPluginDetail } from "../_lib/catalog";
import type { PluginDetail } from "../_lib/catalog";
import { InstallButton } from "../_components/InstallButton";
import { Screenshots } from "../_components/Screenshots";

type PluginParams = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PluginParams): Promise<Metadata> {
  const { id } = await params;
  const detail = await fetchPluginDetail(id);
  return detail
    ? { title: `${detail.name} — Alpine Shell Plugins`, description: detail.shortDescription }
    : { title: "Plugin not found — Alpine Shell" };
}

function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-gray-200">{children}</dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function InfoCard({ detail }: { detail: PluginDetail }) {
  const tags = [
    ...(detail.category ? [detail.category] : []),
    ...detail.keywords,
  ];
  return (
    <div className="rounded-xl bg-white/5 p-5">
      <dl className="space-y-3 text-sm">
        {detail.author && (
          <MetaRow label="Developer">
            {detail.author.url ? (
              <a
                href={detail.author.url}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-white"
              >
                {detail.author.name}
              </a>
            ) : (
              detail.author.name
            )}
          </MetaRow>
        )}
        <MetaRow label="Version">
          <span className="font-mono">v{detail.version}</span>
        </MetaRow>
        {detail.size != null && (
          <MetaRow label="Size">{formatBytes(detail.size)}</MetaRow>
        )}
        {detail.updatedAt && (
          <MetaRow label="Updated">{formatDate(detail.updatedAt)}</MetaRow>
        )}
      </dl>

      {tags.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <span className="text-sm text-gray-500">Tags</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {(detail.homepage || detail.repository) && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-4 text-sm">
          {detail.homepage && (
            <a
              href={detail.homepage}
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 transition hover:text-white"
            >
              Homepage ↗
            </a>
          )}
          {detail.repository && (
            <a
              href={detail.repository}
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 transition hover:text-white"
            >
              Repository ↗
            </a>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-5">
        <InstallButton id={detail.id} version={detail.version} />
      </div>
    </div>
  );
}

export default async function PluginDetailPage({ params }: PluginParams) {
  const { id } = await params;
  const detail = await fetchPluginDetail(id);
  if (!detail) notFound();

  return (
    <main className="relative flex min-h-screen flex-col text-white">
      <NavBar theme="dark" />
      <article className="flex-1 px-8 pt-32 pb-16">
        <div className="container mx-auto">
          <Link
            href="/plugins"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-300"
          >
            <ArrowLeftIcon />
            All plugins
          </Link>

          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12">
            <div className="min-w-0">
              <header className="flex items-start gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5">
                  {detail.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detail.iconUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-averia text-2xl text-gray-400">
                      {detail.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <h1 className="font-averia text-3xl font-semibold">{detail.name}</h1>
                  <p className="mt-1 text-gray-400">{detail.shortDescription}</p>
                </div>
              </header>

              {detail.screenshots.length > 0 && (
                <section className="mt-10">
                  <Screenshots screenshots={detail.screenshots} />
                </section>
              )}

              {detail.readme && (
                <section className="mt-10 max-w-3xl">
                  <Markdown source={detail.readme} />
                </section>
              )}
            </div>

            <aside className="self-start lg:sticky lg:top-28">
              <InfoCard detail={detail} />
            </aside>
          </div>
        </div>
      </article>
      <Footer theme="dark" />
    </main>
  );
}
