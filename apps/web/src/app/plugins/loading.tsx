import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

export default function PluginsLoading() {
  return (
    <main className="relative flex min-h-screen flex-col text-white">
      <NavBar theme="dark" />
      <section className="flex-1 px-8 pt-32 pb-16">
        <div className="container mx-auto">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded bg-white/5" />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/5"
              />
            ))}
          </ul>
        </div>
      </section>
      <Footer theme="dark" />
    </main>
  );
}
