import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { Markdown } from "../../docs/_lib/Markdown";
import { fetchPluginDetail } from "../_lib/catalog";
import type { PluginDetail } from "../_lib/catalog";
import { PermissionRow } from "../_components/PermissionRow";
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

function hasReadScope(permissions: string[]): boolean {
  return permissions.some(
    (p) => p.startsWith("read:") || p === "net:fetch" || p === "location:coarse",
  );
}

function DataFlowNote({ detail }: { detail: PluginDetail }) {
  const notes: React.ReactNode[] = [];
  if (hasReadScope(detail.permissions) && detail.networkConnect.length > 0) {
    notes.push(
      <p key="flow" className="text-sm text-amber-200">
        This plugin can send data it reads to:{" "}
        {detail.networkConnect.map((host, i) => (
          <span key={host}>
            {i > 0 ? ", " : ""}
            <span className="font-mono">{new URL(host).host}</span>
          </span>
        ))}
        .
      </p>,
    );
  }
  if (detail.permissions.includes("node")) {
    notes.push(
      <p key="node" className="text-sm text-red-200">
        Runs a background process (requires a verified publisher).
      </p>,
    );
  }
  if (notes.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
      {notes}
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
          className="text-sm text-gray-500 transition hover:text-gray-300"
        >
          ← All plugins
        </Link>

        <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
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
              <div className="flex items-center gap-3">
                <h1 className="font-averia text-3xl font-semibold">{detail.name}</h1>
                {detail.verified && (
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-200">
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-gray-400">{detail.shortDescription}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                {detail.author &&
                  (detail.author.url ? (
                    <a
                      href={detail.author.url}
                      className="transition hover:text-gray-300"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {detail.author.name}
                    </a>
                  ) : (
                    <span>{detail.author.name}</span>
                  ))}
                <span>v{detail.version}</span>
                {detail.category && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                    {detail.category}
                  </span>
                )}
              </div>
            </div>
          </div>
          <InstallButton id={detail.id} version={detail.version} />
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

        <section className="mt-12 max-w-3xl">
          <h2 className="font-averia text-2xl">Permissions this plugin requests</h2>
          {detail.permissions.length === 0 ? (
            <p className="mt-3 text-gray-400">
              This plugin requests no special permissions.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-500">
                Alpine Shell asks you to confirm these when you install.
              </p>
              <ul className="mt-4 space-y-3">
                {detail.permissions.map((token) => (
                  <PermissionRow
                    key={token}
                    token={token}
                    reason={detail.permissionReasons[token]}
                  />
                ))}
              </ul>
              <DataFlowNote detail={detail} />
            </>
          )}
        </section>

        </div>
      </article>
      <Footer theme="dark" />
    </main>
  );
}
