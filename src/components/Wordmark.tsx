import { Link } from "react-router";

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="TrailZ home">
      Trail<span>Z</span>
    </Link>
  );
}
