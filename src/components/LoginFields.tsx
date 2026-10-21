import { useState } from "react";
import { Icon } from "./Icon";

/** Inline error under a field (red, with the alert mark). */
export function FieldError({ text }: { text: string }) {
  return (
    <div className="field-error" role="alert">
      <Icon name="alert" size={16} /> <span>{text}</span>
    </div>
  );
}

/** Password input with a show/hide eye (23c, 16a). */
export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  error = false,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        id={id}
        className={`field${error ? " error" : ""}`}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="pw-eye" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>
        <Icon name={show ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}

/**
 * The 6-digit code (23a): one real input (so the phone can autofill the code from the email and pasting works),
 * drawn as six boxes underneath it.
 */
export function CodeInput({
  id,
  value,
  onChange,
  error = false,
  locked = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  locked?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`code-boxes${error ? " error" : ""}`}>
      <div className="code-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && !locked && i === value.length;
          return (
            <span key={i} className={`code-box${value[i] ? " filled" : ""}${active ? " active" : ""}`}>
              {value[i] ?? ""}
              {active && <span className="code-caret" />}
            </span>
          );
        })}
      </div>
      <input
        id={id}
        className="code-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        value={value}
        readOnly={locked}
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // No maxLength: a pasted "482 913" must keep all six digits.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </div>
  );
}
