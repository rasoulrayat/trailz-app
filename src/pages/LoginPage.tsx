import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ApiError } from "../../shared/types";
import { looksLikeEmail, normalizeEmail, suggestEmail } from "../../shared/login";
import { ApiFailure, meApi } from "../api";
import { lastLogin, loadMe, rememberLogin, safeNextPath, useMe } from "../auth";
import { GoogleButton } from "../components/Account";
import { CodeInput, FieldError, PasswordField } from "../components/LoginFields";
import { Icon } from "../components/Icon";

type Step = "email" | "code" | "password";
type Problem = { code: ApiError["error"]; text: string };

const problem = (e: unknown): Problem =>
  e instanceof ApiFailure ? { code: e.code, text: e.message } : { code: "server_error", text: "Something went wrong. Try again." };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Log in with email (design 23, 23a, 23b, 23c): email → 6-digit code, or email + password. */
export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const navigate = useNavigate();
  const me = useMe();
  const remembered = useRef(lastLogin()).current;

  const [step, setStep] = useState<Step>(remembered.method === "password" && remembered.email ? "password" : "email");
  const [email, setEmail] = useState(remembered.email);
  const [touched, setTouched] = useState(false); // the typo hint waits until the field is left or sent
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [devCode, setDevCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const tried = useRef("");

  const clean = normalizeEmail(email);
  const suggestion = touched ? suggestEmail(email) : null;
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // Already logged in: nothing to do here.
  useEffect(() => {
    if (me.loaded && me.user && !accepted) navigate(next, { replace: true });
  }, [me.loaded, me.user]); // eslint-disable-line react-hooks/exhaustive-deps

  // The "Send a new code in 0:42" countdown.
  useEffect(() => {
    if (step !== "code") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);

  // The code logs in as soon as the 6th digit is in (typed, pasted or autofilled).
  useEffect(() => {
    if (step === "code" && code.length === 6 && code !== tried.current && !busy) void verify(code);
  }, [code, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (method: "code" | "password") => {
    setAccepted(true);
    rememberLogin(method, clean);
    await loadMe(true);
    navigate(next, { replace: true });
  };

  async function sendCode() {
    setTouched(true);
    if (!looksLikeEmail(clean)) {
      setError({ code: "bad_email", text: "That doesn't look like an email address. Check for typos." });
      setStep("email");
      return;
    }
    // Back on the email step with the same address and a code that's still fresh: just go type it.
    if (step !== "code" && clean === sentTo && Date.now() < resendAt) {
      setError(null);
      setStep("code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await meApi.emailStart(clean);
      setEmail(clean);
      setSentTo(clean);
      setCode("");
      tried.current = "";
      setDevCode(r.devCode ?? null);
      setResendAt(Date.now() + r.resendIn * 1000);
      setNow(Date.now());
      setStep("code");
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (value.length !== 6) return;
    tried.current = value;
    setBusy(true);
    setError(null);
    try {
      await meApi.emailVerify(clean, value);
      await go("code");
    } catch (e) {
      setError(problem(e));
      setBusy(false);
    }
  }

  async function loginWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!looksLikeEmail(clean)) return setError({ code: "bad_email", text: "Enter the email address you log in with." });
    if (!password) return setError({ code: "password_wrong", text: "Enter your password." });
    setBusy(true);
    setError(null);
    try {
      await meApi.passwordLogin(clean, password);
      await go("password");
    } catch (err) {
      setError(problem(err));
      setBusy(false);
    }
  }

  const back = () => {
    setError(null);
    if (step !== "email") return setStep("email");
    if (window.history.length > 1) navigate(-1);
    else navigate(next);
  };

  const codeError = error && (error.code === "code_wrong" || error.code === "code_expired");
  // Can't send right now (limits, or email not set up): Google is the way in.
  const offerGoogle = me.canLogin && error && (error.code === "too_many" || error.code === "busy");

  return (
    <main className="page login">
      <div className="topbar">
        <button className="icon-btn plain" aria-label="Back" onClick={back}>
          <Icon name="back" />
        </button>
      </div>

      <div className="login-head">
        <span className="login-badge">
          <Icon name={step === "password" ? "lock" : "mail"} size={26} />
        </span>
        {step === "email" && (
          <>
            <h1 className="login-h">Log in with email</h1>
            <p className="lead">We'll email you a 6-digit code. No password needed.</p>
          </>
        )}
        {step === "code" && (
          <>
            <h1 className="login-h">Check your email</h1>
            <p className="lead">
              We sent a 6-digit code to <b className="login-email">{clean}</b>.{" "}
              <button type="button" className="inline-link" onClick={back}>
                Change
              </button>
            </p>
          </>
        )}
        {step === "password" && (
          <>
            <h1 className="login-h">Log in with password</h1>
            <p className="lead">If you've set one in You. A code always works too.</p>
          </>
        )}
      </div>

      {step === "email" && (
        <form
          className="login-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <div className="login-field">
            <label htmlFor="login-email" className="field-label">
              Your email
            </label>
            <input
              id="login-email"
              className={`field${error?.code === "bad_email" ? " error" : ""}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              autoFocus
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              onBlur={() => setTouched(true)}
            />
            {suggestion && (
              <div className="login-suggest">
                <span>
                  Did you mean <b>{suggestion}</b>?
                </span>
                <button type="button" className="chip-btn" onClick={() => setEmail(suggestion)}>
                  Use it
                </button>
              </div>
            )}
            {error && <FieldError text={error.text} />}
          </div>
          <button className="btn" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner on-navy" aria-hidden="true" /> Sending your code…
              </>
            ) : (
              <>
                Email me a code <Icon name="arrow" size={18} />
              </>
            )}
          </button>
          {offerGoogle && <GoogleButton next={next} />}
          <button
            type="button"
            className="btn link"
            onClick={() => {
              setError(null);
              setStep("password");
            }}
          >
            I have a password
          </button>
        </form>
      )}

      {step === "code" && (
        <div className="login-form">
          <div className="login-field">
            <label htmlFor="login-code" className="field-label">
              6-digit code
            </label>
            <CodeInput
              id="login-code"
              value={code}
              error={!!codeError}
              locked={busy || accepted}
              onChange={(v) => {
                setCode(v);
                if (error && error.code !== "code_expired") setError(null);
              }}
            />
            {accepted ? (
              <div className="login-ok" role="status">
                <Icon name="check" size={16} /> Code accepted. Logging you in…
              </div>
            ) : error ? (
              <FieldError text={error.text} />
            ) : (
              <p className="small" style={{ margin: 0, lineHeight: 1.45 }}>
                {busy ? "Checking the code…" : "Logs you in as soon as the 6th digit is in. Pasting works too."}
              </p>
            )}
            {error?.code === "code_expired" && (
              <button type="button" className="btn outline" disabled={busy || wait > 0} onClick={() => void sendCode()}>
                {wait > 0 ? `Send a new code in ${clock(wait)}` : "Send a new code"}
              </button>
            )}
            {offerGoogle && <GoogleButton next={next} />}
          </div>
          <button className="btn" disabled={code.length < 6 || busy || accepted} onClick={() => void verify(code)}>
            {busy && !accepted ? (
              <>
                <span className="spinner on-navy" aria-hidden="true" /> Checking…
              </>
            ) : (
              "Log in"
            )}
          </button>
          {error?.code !== "code_expired" && (
            <div className="login-resend">
              <span className="small">No email? Check spam and Promotions.</span>
              <button type="button" className="btn link" disabled={wait > 0 || busy} onClick={() => void sendCode()}>
                {wait > 0 ? `Send a new code in ${clock(wait)}` : "Send a new code"}
              </button>
            </div>
          )}
          {devCode && (
            <p className="login-dev">
              Test mode, no email sent. Your code: <b>{devCode}</b>
            </p>
          )}
        </div>
      )}

      {step === "password" && (
        <form className="login-form" noValidate onSubmit={loginWithPassword}>
          <div className="login-field">
            <label htmlFor="pw-email" className="field-label">
              Email
            </label>
            <input
              id="pw-email"
              className={`field${error?.code === "bad_email" ? " error" : ""}`}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              autoFocus={!email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
            />
          </div>
          <div className="login-field">
            <label htmlFor="pw-password" className="field-label">
              Password
            </label>
            <PasswordField
              id="pw-password"
              autoComplete="current-password"
              value={password}
              autoFocus={!!email}
              error={error?.code === "password_wrong" || error?.code === "password_locked"}
              onChange={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
            />
            {error && <FieldError text={error.text} />}
          </div>
          <button className="btn" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner on-navy" aria-hidden="true" /> Logging in…
              </>
            ) : (
              "Log in"
            )}
          </button>
          <button
            type="button"
            className="btn link"
            onClick={() => {
              setError(null);
              if (looksLikeEmail(clean)) void sendCode();
              else setStep("email");
            }}
          >
            Forgot it? Email me a code
          </button>
        </form>
      )}

      <p className="small login-foot">
        {step === "email" && (
          <>
            Free. New here? The code creates your account.
            <br />
            We use your email only to log you in.
          </>
        )}
        {step === "code" && "The code works for 15 minutes, once."}
        {step === "password" && "This phone remembers you used a password, so next time it opens here."}
      </p>
    </main>
  );
}
