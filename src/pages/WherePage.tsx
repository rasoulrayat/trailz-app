import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";

/** "It is a place, let me say where" — the user names the place themselves. */
export function WherePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  return (
    <main className="page">
      <div className="topbar">
        <Link to={`/check/${id}`} className="icon-btn plain" aria-label="Back">
          <Icon name="back" size={22} />
        </Link>
      </div>
      <h1>Where is it?</h1>
      <p className="lead">Type the place, like “Café de Flore, Paris” or “Lake Bled”. We'll check it on the map and build its Reality Card.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) navigate(`/check/${id}/place?name=${encodeURIComponent(name.trim())}&typed=1`);
        }}
      >
        <label htmlFor="where" className="sr-only">
          Place name
        </label>
        <div className="paste">
          <span style={{ color: "var(--muted)", display: "flex" }}>
            <Icon name="search" />
          </span>
          <input id="where" autoFocus placeholder="Place name and city" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={!name.trim()}>
          Show the Reality Card
          <Icon name="arrow" size={18} />
        </button>
      </form>
    </main>
  );
}
