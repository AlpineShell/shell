import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";

export default function PluginNotFound() {
  return (
    <main className="relative flex min-h-screen flex-col bg-[#050a1a] text-white">
      <NavBar theme="dark" />
      <section className="container mx-auto flex flex-1 flex-col items-center justify-center px-8 pt-32 pb-16 text-center">
        <h1 className="font-averia text-3xl font-semibold">Plugin not found</h1>
        <p className="mt-3 max-w-md text-gray-400">
          We couldn&apos;t find a plugin with that id. It may have been unpublished
          or the link is out of date.
        </p>
        <Link
          href="/plugins"
          className="mt-6 rounded-full bg-white px-6 py-2 font-averia text-black transition hover:bg-gray-200"
        >
          Browse all plugins
        </Link>
      </section>
      <Footer theme="dark" />
    </main>
  );
}
