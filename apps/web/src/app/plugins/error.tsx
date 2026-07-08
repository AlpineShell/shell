"use client";

export default function PluginsError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-8 text-center text-white">
      <h1 className="font-averia text-3xl font-semibold">
        Couldn&apos;t load the catalog
      </h1>
      <p className="mt-3 max-w-md text-gray-400">
        We couldn&apos;t reach the plugin marketplace right now. Please try again
        in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-white px-6 py-2 font-averia text-black transition hover:bg-gray-200"
      >
        Try again
      </button>
    </main>
  );
}
