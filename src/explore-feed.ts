import type { ExploreItem } from "../shared/types";

/** The list Explore last showed, in its order, so the reel viewer swipes through the same reels. */
let feed: ExploreItem[] = [];

export const setExploreFeed = (items: ExploreItem[]) => {
  feed = items;
};
export const getExploreFeed = () => feed;
