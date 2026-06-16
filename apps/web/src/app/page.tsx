import NavBar from "./components/NavBar";
import StarField from "./components/StarField";

const noise =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function Home() {
  return (
    <main className="relative bg-[#050a1a] text-white">
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(125% 85% at 50% -10%, #1b3a8f 0%, #0b1430 45%, #050a1a 75%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 78% 12%, rgba(56,108,255,0.28), transparent 70%)",
          }}
        />

        <StarField />

        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.13]"
          style={{ backgroundImage: noise }}
        />

        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 top-[100vh] bg-white"
        />

        <div className="relative z-10 flex flex-1 flex-col">
          <NavBar />
          <div className="container mx-auto flex min-h-[50vh] flex-1 flex-col items-center justify-center px-8 pb-8 text-center">
            <h1 className="max-w-3xl font-averia text-5xl font-semibold tracking-tight sm:text-6xl">
              Not their slop. Your PC!
            </h1>
            <p className="mt-3 max-w-xl text-xl text-gray-300">
              A Desktop that makes your PC clean and usable. Remove the slop and get productive :)
            </p>
            <div className="mt-8 flex gap-8">
              <button>Learn more</button>
              <button className="py-2 px-6 text-black bg-white rounded-full">Get Started</button>
            </div>
          </div>
          <div className="container mx-auto shrink-0">
            <div className="aspect-video w-full overflow-hidden rounded-t-3xl bg-white">
              <iframe
                className="h-full w-full"
                src="https://www.youtube.com/embed/jxnqmhGL2aA?start=317"
                title="Alpine Shell demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
