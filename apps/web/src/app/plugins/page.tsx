import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { fetchCatalog } from "./_lib/catalog";
import { PluginCard } from "./_components/PluginCard";

export const metadata: Metadata = {
  title: "Plugins — Alpine Shell",
  description: "Extend your desktop. Browse Alpine Shell plugins.",
};

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
      <h2 className="font-averia text-2xl text-white">The marketplace is opening soon</h2>
      <p className="mx-auto mt-3 max-w-md text-gray-400">
        No plugins have been published yet. In the meantime, learn how to build
        your own and get it ready to ship.
      </p>
      <Link
        href="/docs/getting-started"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2 font-averia text-black transition hover:bg-gray-200"
      >
        Write your first plugin
      </Link>
    </div>
  );
}

export default async function PluginsPage() {
  const catalog = await fetchCatalog();
  return (
    <main className="relative flex min-h-screen flex-col bg-[#050a1a] text-white">
      <NavBar theme="dark" />
      <section className="container mx-auto flex-1 px-8 pt-32 pb-16">
        <h1 className="font-averia text-4xl font-semibold tracking-tight sm:text-5xl">
          Plugins
        </h1>
        <p className="mt-3 max-w-xl text-lg text-gray-400">
          Widgets, tools and integrations for your topbar and desktop. Every
          install is confirmed inside Alpine Shell.
        </p>
        {catalog.plugins.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.plugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </ul>
        )}
      </section>
      <Footer theme="dark" />
    </main>
  );
}
