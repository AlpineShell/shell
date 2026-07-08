export interface DocEntry {
  slug: string;
  title: string;
  group: string;
}

export const DOCS_NAV: DocEntry[] = [
  {
    slug: "getting-started",
    title: "Getting started · your first plugin",
    group: "Start here",
  },
  {
    slug: "manifest-reference",
    title: "plugin.json manifest reference",
    group: "Reference",
  },
  {
    slug: "contribution-surfaces",
    title: "Contribution surfaces",
    group: "Reference",
  },
  {
    slug: "sdk-api",
    title: "The @alpine/plugin-sdk API",
    group: "Reference",
  },
  {
    slug: "permissions-security",
    title: "Permissions & the security model",
    group: "Security",
  },
  {
    slug: "publishing",
    title: "Publishing to the marketplace",
    group: "Ship it",
  },
];

export const DOCS_GROUPS = ["Start here", "Reference", "Security", "Ship it"];
