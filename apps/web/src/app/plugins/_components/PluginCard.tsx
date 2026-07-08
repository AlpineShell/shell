import Link from "next/link";
import type { CatalogPlugin } from "../_lib/catalog";

export function PluginCard({ plugin }: { plugin: CatalogPlugin }) {
  return (
    <li>
      <Link
        href={`/plugins/${plugin.id}`}
        className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
            {plugin.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={plugin.iconUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-averia text-lg text-gray-400">
                {plugin.name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-averia text-lg text-white">{plugin.name}</p>
            {plugin.author && (
              <p className="truncate text-xs text-gray-500">{plugin.author.name}</p>
            )}
          </div>
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-gray-400">
          {plugin.shortDescription}
        </p>
        {plugin.category && (
          <span className="mt-4 inline-flex w-fit items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
            {plugin.category}
          </span>
        )}
      </Link>
    </li>
  );
}
