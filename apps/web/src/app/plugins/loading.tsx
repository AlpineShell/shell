import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

export default function PluginsLoading() {
  return (
    <main className="relative flex min-h-screen flex-col text-white">
      <NavBar theme="dark" />
      <p role="status" className="sr-only">
        Loading plugins
      </p>
      <section className="flex-1 px-8 pt-32 pb-16">
        <div aria-hidden="true" className="container mx-auto">
          <div className="h-10 w-44 rounded-lg bg-white/10 motion-safe:animate-pulse sm:h-12" />
          <div className="mt-3 h-7 w-96 max-w-full rounded bg-white/5 motion-safe:animate-pulse" />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="rounded-xl bg-white/5 p-5 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="h-11 w-11 shrink-0 rounded-xl bg-white/10" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-4 w-28 rounded bg-white/10" />
                    <div className="h-3 w-20 rounded bg-white/10" />
                  </div>
                </div>
                <div className="mt-4 h-3.5 w-full rounded bg-white/10" />
                <div className="mt-2 h-3.5 w-3/4 rounded bg-white/10" />
                <div className="mt-4 flex gap-1.5">
                  <div className="h-5 w-16 rounded-full bg-white/10" />
                  <div className="h-5 w-12 rounded-full bg-white/10" />
                  <div className="h-5 w-14 rounded-full bg-white/10" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Footer theme="dark" />
    </main>
  );
}
