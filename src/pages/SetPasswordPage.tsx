import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { ApiError } from "../../shared/types";
import { passwordRules } from "../../shared/login";
import { ApiFailure, meApi } from "../api";
import { emailLoginUrl, loadMe, useMe } from "../auth";
import { FieldError, PasswordField } from "../components/LoginFields";
import { Icon } from "../components/Icon";

/** Set or change the password (design 16a), from the Password card on You. */
export function SetPasswordPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ApiError["error"]; text: string } | null>(null);

  useEffect(() => {
    if (me.loaded && !me.user) navigate(emailLoginUrl("/me/password"), { replace: true });
  }, [me.loaded, me.user, navigate]);

  if (!me.loaded || !me.user) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
      </main>
    );
  }

  const email = me.user.email;
  const has = me.user.hasPassword;
  const rules = passwordRules(password, email);
  const ready = rules.long && rules.notEasy && (!has || current.length > 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await meApi.setPassword(password, has ? current : undefined);
      await loadMe(true);
      navigate("/me", { replace: true, state: { passwordSaved: true } });
    } catch (err) {
      setError(err instanceof ApiFailure ? { code: err.code, text: err.message } : { code: "server_error", text: "Something went wrong. Try again." });
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <div className="topbar">
        <button className="icon-btn plain" aria-label="Back to You" onClick={() => navigate("/me")}>
          <Icon name="back" />
        </button>
      </div>

      <div className="login-head">
        <h1 className="login-h">{has ? "Change your password" : "Set a password"}</h1>
        {email ? (
          <p className="lead">
            For logging in as <b className="login-email">{email}</b>. You can still log in with a code any time.
          </p>
        ) : (
          <p className="lead">Your account has no email address, so a password can't be used with it.</p>
        )}
      </div>

      {email && (
        <form className="login-form" noValidate onSubmit={save}>
          {/* Lets password managers save the new password under the right address. */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          {has && (
            <div className="login-field">
              <label htmlFor="current-password" className="field-label">
                Current password
              </label>
              <PasswordField
                id="current-password"
                autoComplete="current-password"
                value={current}
                autoFocus
                error={error?.code === "password_wrong"}
                onChange={(v) => {
                  setCurrent(v);
                  if (error) setError(null);
                }}
              />
            </div>
          )}
          <div className="login-field">
            <label htmlFor="new-password" className="field-label">
              New password
            </label>
            <PasswordField
              id="new-password"
              autoComplete="new-password"
              value={password}
              autoFocus={!has}
              error={error?.code === "password_weak"}
              onChange={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
            />
            <ul className="pw-rules">
              <li className={rules.long ? "ok" : ""}>
                <Icon name={rules.long ? "check" : "circle"} size={16} /> 8 characters or more
              </li>
              <li className={rules.notEasy ? "ok" : ""}>
                <Icon name={rules.notEasy ? "check" : "circle"} size={16} /> Not your email or an easy one like 12345678
              </li>
            </ul>
          </div>
          {error && <FieldError text={error.text} />}
          <button className="btn" disabled={!ready || busy}>
            {busy ? (
              <>
                <span className="spinner on-navy" aria-hidden="true" /> Saving…
              </>
            ) : (
              "Save password"
            )}
          </button>
        </form>
      )}

      <p className="small login-foot">Stored only as a scrambled hash. Not even TrailZ can read it.</p>
    </main>
  );
}
