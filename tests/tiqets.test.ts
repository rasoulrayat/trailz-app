import { describe, expect, it } from "vitest";
import { TIQETS_HOME, tiqetsFor } from "../worker/lib/tiqets";

const path = (u: string) => u.replace("https://www.tiqets.com/en/", "");

describe("Tiqets for an activity", () => {
  it("opens the exact ticket when Tiqets sells one in that town", () => {
    expect(path(tiqetsFor("Sagrada Família", "Barcelona", "Spain").url)).toBe("barcelona-attractions-c66342/tickets-for-sagrada-familia-entry-ticket-p1111400/");
    expect(path(tiqetsFor("Van Gogh Museum", "Amsterdam").url)).toBe("amsterdam-attractions-c75061/tickets-for-van-gogh-museum-p974079/");
    const alhambra = tiqetsFor("Alhambra & Generalife at opening", "Granada, Spain");
    expect(alhambra.match).toBe("ticket");
    expect(alhambra.url).toContain("alhambra-generalife");
  });

  it("prefers the plain entry ticket over a family or guided version", () => {
    expect(path(tiqetsFor("Colosseum", "Rome", "Italy").url)).not.toMatch(/famil|small-group/);
  });

  it("skips tickets that leave out what was asked (…without house entry)", () => {
    const anne = tiqetsFor("Anne Frank House", "Amsterdam", "Netherlands");
    expect(anne.url).not.toContain("without");
    expect(anne.match).toBe("town");
  });

  it("falls back to the town, then the region, then the country, then Tiqets itself", () => {
    expect(tiqetsFor("A walk along the river", "Naples", "Italy")).toMatchObject({ match: "town", url: "https://www.tiqets.com/en/naples-attractions-c71720/" });
    expect(tiqetsFor("Boat trip to the caldera", "Santorini", "Greece")).toMatchObject({ match: "region", url: "https://www.tiqets.com/en/santorini-attractions-r1420/" });
    expect(tiqetsFor("Path of the Gods hike", "Positano", "Italy")).toMatchObject({ match: "country", url: "https://www.tiqets.com/en/italy-attractions-z50109/" });
    expect(tiqetsFor("Something", "Nowhereville", "Atlantis")).toEqual({ url: TIQETS_HOME, match: "home" });
  });
});
