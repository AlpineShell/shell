import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_ROOT = path.join(process.cwd(), "src/app/docs/content");

export async function loadDoc(slug: string): Promise<string> {
  if (path.isAbsolute(slug) || slug.split("/").includes("..")) {
    throw new Error(`invalid doc path: ${slug}`);
  }
  const file = path.resolve(CONTENT_ROOT, `${slug}.md`);
  if (!file.startsWith(CONTENT_ROOT + path.sep)) {
    throw new Error(`doc path escapes content root: ${slug}`);
  }
  return readFile(file, "utf8");
}
