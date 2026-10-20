// Seen live on 20 Oct: opening the app sometimes jumped to a Klook page. Travelpayouts Drive's script
// ("Show targeted offers") opens a partner site in the same tab by itself. The start page loads no outside scripts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the start page", () => {
  const html = readFileSync("index.html", "utf8").replace(/<!--[\s\S]*?-->/g, "");
  it("doesn't load Travelpayouts Drive or any other outside script", () => {
    expect(html).not.toMatch(/emrldtp|travelpayouts|tp\.media/i);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
    expect(html).not.toMatch(/createElement\(["']script["']\)/);
  });
});
