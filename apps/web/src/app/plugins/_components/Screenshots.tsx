import type { PluginScreenshot } from "../_lib/catalog";

export function Screenshots({ screenshots }: { screenshots: PluginScreenshot[] }) {
  if (screenshots.length === 0) return null;
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <div className="flex gap-4">
        {screenshots.map((shot) => (
          <figure key={shot.src} className="w-72 shrink-0 sm:w-96">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.src}
              alt={shot.caption ?? ""}
              className="w-full rounded-xl border border-white/10 bg-white/5"
            />
            {shot.caption && (
              <figcaption className="mt-2 text-xs text-gray-500">
                {shot.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
