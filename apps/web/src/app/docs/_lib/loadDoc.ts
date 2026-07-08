import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadDoc(slug: string): Promise<string> {
  const file = path.join(process.cwd(), "src/app/docs/content", `${slug}.md`);
  return readFile(file, "utf8");
}
