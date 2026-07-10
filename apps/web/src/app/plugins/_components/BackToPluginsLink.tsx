import Link from "next/link";

function ArrowLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function BackToPluginsLink() {
  return (
    <Link
      href="/plugins"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-300"
    >
      <ArrowLeftIcon />
      All plugins
    </Link>
  );
}
