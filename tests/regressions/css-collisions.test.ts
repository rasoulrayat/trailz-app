import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One stylesheet, many screens: a class defined twice silently restyles another page
 * (the booking step chips once turned the "Checking your reel" checklist into a horizontal row).
 * Every top-level selector may be declared once; share styles by sharing the class, not the name.
 */
describe("styles.css", () => {
  it("defines each selector only once", () => {
    const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    // top-level rules only (skip @media/@keyframes bodies)
    let depth = 0;
    for (const line of css.split("\n")) {
      const t = line.trim();
      if (t.startsWith("@")) { depth += (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length; continue; }
      if (depth > 0) { depth += (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length; continue; }
      const m = t.match(/^([^{@}]+?)\s*\{/);
      if (!m) continue;
      const sel = m[1].replace(/\s+/g, " ").trim(); // the whole selector list, as written
      const n = (seen.get(sel) ?? 0) + 1;
      seen.set(sel, n);
      if (n === 2) dupes.push(sel);
    }
    expect(dupes, `selectors declared more than once: ${dupes.join(", ")}`).toEqual([]);
  });
});
