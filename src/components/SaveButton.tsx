import { useState } from "react";
import type { NewSave } from "../api";
import { toggleSave, useSaves, findSaved } from "../saves";
import { Icon } from "./Icon";

/** The heart. `compact` is the small round one for list rows. */
export function SaveButton({ place, compact }: { place: NewSave; compact?: boolean }) {
  useSaves();
  const saved = !!findSaved(place.name, place.country);
  const [pop, setPop] = useState(false);
  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPop(true);
    setTimeout(() => setPop(false), 350);
    await toggleSave(place);
  };
  if (compact) {
    return (
      <button type="button" className={`heart${saved ? " on" : ""}${pop ? " pop" : ""}`} aria-pressed={saved} aria-label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`} onClick={onClick}>
        <Icon name="heart" size={16} />
      </button>
    );
  }
  return (
    <button type="button" className={`btn secondary${saved ? " saved" : ""}${pop ? " pop" : ""}`} style={{ width: "auto" }} aria-pressed={saved} onClick={onClick}>
      <Icon name="heart" size={18} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
