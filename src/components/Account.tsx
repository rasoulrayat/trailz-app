import { Link } from "react-router";
import { loginUrl, useMe } from "../auth";
import { Icon } from "./Icon";

/** "Continue with Google": a plain link, so the browser does the OAuth round-trip itself. */
export function GoogleButton({ next, label = "Continue with Google", light = false }: { next?: string; label?: string; light?: boolean }) {
  return (
    <a href={loginUrl(next)} className={`btn google${light ? " light" : ""}`} rel="nofollow">
      <span className="g-mark" aria-hidden="true">G</span>
      {label}
    </a>
  );
}

/** Top-bar entry to the account: avatar when signed in, a small "Log in" when not. */
export function AccountButton() {
  const me = useMe();
  if (!me.loaded) return <span style={{ width: 36 }} />;
  if (me.user) {
    const initial = (me.user.name ?? me.user.email ?? "?").trim().charAt(0).toUpperCase();
    return (
      <Link to="/me" className="avatar" aria-label="Your account">
        {me.user.avatar ? <img src={me.user.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
      </Link>
    );
  }
  return (
    <Link to="/me" className="chip" style={{ gap: 6 }}>
      <Icon name="user" size={14} /> Log in
    </Link>
  );
}
