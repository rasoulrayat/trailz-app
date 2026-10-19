import { useEffect, useState } from "react";
import type { ShareVotes } from "../../shared/types";
import { shareApi } from "../api";
import { Icon } from "./Icon";

/**
 * "Ask friends": makes a share link once, opens the phone's share sheet (or copies), and shows the
 * running vote next to it. `onMedia` is the round translucent style for the card header.
 */
export function ShareButton({ kind, id, placeName, title, onMedia }: { kind: "check" | "trip"; id: string; placeName?: string; title: string; onMedia?: boolean }) {
  const [votes, setVotes] = useState<ShareVotes | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    shareApi.mine(kind, id, placeName).then((r) => setVotes(r.votes)).catch(() => {});
  }, [kind, id]);

  async function go() {
    const { url } = await shareApi.create(kind, id, placeName);
    const text = kind === "check" ? `${title}: is it worth it? Vote on TrailZ` : `${title}: are you in? Vote on TrailZ`;
    if (navigator.share) {
      navigator.share({ title: `${title} · TrailZ`, text, url }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        prompt("Copy this link", url);
      }
    }
    shareApi.mine(kind, id, placeName).then((r) => setVotes(r.votes)).catch(() => {});
  }

  const tally = votes && votes.in + votes.out > 0 ? `${votes.in} in · ${votes.out} out` : null;
  if (onMedia)
    return (
      <button className="icon-btn on-media" aria-label="Ask friends" onClick={go} style={tally ? { width: "auto", padding: "0 12px", gap: 6, fontSize: 12, fontWeight: 600 } : undefined}>
        <Icon name="share" size={18} />
        {tally}
      </button>
    );
  return (
    <button className="btn secondary" style={{ width: "auto" }} onClick={go}>
      <Icon name="share" size={18} />
      {copied ? "Link copied" : tally ? `Friends: ${tally}` : "Ask friends"}
    </button>
  );
}
