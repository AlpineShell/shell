export interface DocEntry {
  slug: string;
  title: string;
  section: string;
  group: string;
}

export const DOCS_SECTIONS = ["Alpine Shell", "Building plugins"];

export const DOCS_GROUPS = ["Overview", "Get started", "Guides", "Reference"];

export const DOCS_NAV: DocEntry[] = [
  {
    slug: "welcome",
    title: "Welcome",
    section: "Alpine Shell",
    group: "Overview",
  },
  {
    slug: "plugins/getting-started",
    title: "Getting started: your first plugin",
    section: "Building plugins",
    group: "Get started",
  },
  {
    slug: "plugins/contributions",
    title: "Contribution points",
    section: "Building plugins",
    group: "Guides",
  },
  {
    slug: "plugins/backend",
    title: "Add a backend",
    section: "Building plugins",
    group: "Guides",
  },
  {
    slug: "plugins/publishing",
    title: "Publishing your plugin",
    section: "Building plugins",
    group: "Guides",
  },
  {
    slug: "plugins/manifest",
    title: "Manifest reference (plugin.json)",
    section: "Building plugins",
    group: "Reference",
  },
  {
    slug: "plugins/sdk",
    title: "Plugin SDK reference",
    section: "Building plugins",
    group: "Reference",
  },
];
