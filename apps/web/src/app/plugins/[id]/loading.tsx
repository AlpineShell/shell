import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { BackToPluginsLink } from "../_components/BackToPluginsLink";

export default function PluginDetailLoading() {
  return (
    <main className="relative flex min-h-screen flex-col text-white">
      <NavBar theme="dark" />
      <p role="status" className="sr-only">
        Loading plugin details
      </p>
      <article className="flex-1 px-8 pt-32 pb-16">
        <div className="container mx-auto">
          <BackToPluginsLink />

          <div
            aria-hidden="true"
            className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12"
          >
            <div className="min-w-0 motion-safe:animate-pulse">
              <header className="flex items-start gap-4">
                <span className="h-16 w-16 shrink-0 rounded-2xl bg-white/5" />
                <div className="min-w-0 flex-1">
                  <div className="h-9 w-64 max-w-full rounded-lg bg-white/10" />
                  <div className="mt-2.5 h-4 w-96 max-w-full rounded bg-white/5" />
                </div>
              </header>

              <div className="-mx-2 mt-10 overflow-hidden px-2 pb-2">
                <div className="flex gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video w-72 shrink-0 rounded-xl border border-white/10 bg-white/5 sm:w-96"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-10 max-w-3xl space-y-3">
                <div className="h-4 w-full rounded bg-white/5" />
                <div className="h-4 w-11/12 rounded bg-white/5" />
                <div className="h-4 w-4/5 rounded bg-white/5" />
                <div className="h-4 w-full rounded bg-white/5" />
                <div className="h-4 w-2/3 rounded bg-white/5" />
              </div>
            </div>

            <aside className="self-start lg:sticky lg:top-28">
              <div className="rounded-xl bg-white/5 p-5 motion-safe:animate-pulse">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="h-5 w-16 rounded bg-white/10" />
                      <div className="h-5 w-24 rounded bg-white/10" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="h-5 w-10 rounded bg-white/10" />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <div className="h-5 w-16 rounded-full bg-white/10" />
                    <div className="h-5 w-12 rounded-full bg-white/10" />
                    <div className="h-5 w-14 rounded-full bg-white/10" />
                  </div>
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="h-11 w-full rounded-xl bg-white/10" />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </article>
      <Footer theme="dark" />
    </main>
  );
}
