import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from "react";

/**
 * A picture that never "pops": a shimmer fills the box while it loads, then the image fades in.
 * Keeps the box's size, so nothing jumps.
 */
export function Img({
  src,
  className,
  style,
  alt = "",
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null }) {
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    // Cached images are complete before React attaches onLoad: check now.
    const el = ref.current;
    setReady(!!(el && el.complete && el.naturalWidth > 0));
  }, [src]);
  const box: CSSProperties = { position: "relative", overflow: "hidden", ...style };
  return (
    <span className={`img-box${className ? ` ${className}` : ""}`} style={box}>
      {src && !failed && (
        <img
          {...rest}
          ref={ref}
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
          className={`img-fade${ready ? " in" : ""}`}
        />
      )}
      {!ready && !failed && src && <span className="img-shimmer" aria-hidden="true" />}
    </span>
  );
}
