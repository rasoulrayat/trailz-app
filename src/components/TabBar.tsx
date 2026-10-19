import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { Icon, type IconName } from "./Icon";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/explore", label: "Explore", icon: "compass" },
  { to: "/saved", label: "Vibe", icon: "heart" },
  { to: "/trips", label: "Trips", icon: "trips" },
];

/** True while the page is being scrolled; false ~200 ms after it stops. */
function useScrolling() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setScrolling(false), 220);
    };
    // Capture: catches nested scrollers too (lists, sheets).
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      clearTimeout(timer.current);
    };
  }, []);
  return scrolling;
}

/**
 * Floating glass tab bar. While the page scrolls it shrinks to a compact pill (icons only);
 * when scrolling stops it grows back.
 */
export function TabBar() {
  const compact = useScrolling();
  return (
    <>
      <div className="tabbar-space" aria-hidden="true" />
      <nav className={`tabbar${compact ? " compact" : ""}`} aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => `tab${isActive ? " on" : ""}`} aria-label={t.label}>
            <Icon name={t.icon} size={22} />
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
