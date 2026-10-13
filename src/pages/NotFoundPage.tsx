import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>This page doesn't exist</h1>
      <Link to="/" className="btn">
        Go home
      </Link>
    </main>
  );
}
