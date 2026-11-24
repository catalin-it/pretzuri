/* eslint-disable @next/next/no-img-element -- images come from our Storage at fixed sizes; next/image would need remotePatterns per environment */

/** Product image from Storage, or a neutral placeholder (no shop hot-linking). */
export function ProductImage({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface text-muted"
        style={{ maxWidth: size * 2 }}
      >
        <svg viewBox="0 0 24 24" width={size / 3} height={size / 3} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 17l-5-5-8 8" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="aspect-square w-full rounded-lg bg-white object-contain"
      style={{ maxWidth: size * 2 }}
    />
  );
}
