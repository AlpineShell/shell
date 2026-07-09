import Link from "next/link";
import type { CatalogPlugin } from "../_lib/catalog";

export function PluginCard({ plugin }: { plugin: CatalogPlugin }) {
  const tags = [
    ...(plugin.category ? [plugin.category] : []),
    ...plugin.keywords,
  ];
  const shownTags = tags.slice(0, 3);
  const extraTags = tags.length - shownTags.length;
  return (
    <li>
      <Link
        href={`/plugins/${plugin.id}`}
        className="flex h-full flex-col rounded-xl bg-white/5 p-5 transition hover:bg-white/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5">
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
          <div className="flex flex-col">
            <p className="truncate font-averia text-lg -mb-1 text-white">{plugin.name}</p>
            {plugin.author && (
              <p className="truncate text-xs text-gray-500">{plugin.author.name}</p>
            )}
          </div>
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-gray-400">
          {plugin.shortDescription}
        </p>
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {shownTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-gray-300"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-gray-500">
                +{extraTags}
              </span>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}
