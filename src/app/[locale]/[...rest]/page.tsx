import { notFound } from "next/navigation";

// Catch-all for unknown URLs under a locale. Without it Next serves its prerendered `_not-found` shell, whose
// scripts carry no CSP nonce (hydration is blocked). Routing through the locale layout keeps the per-request nonce.
export default function UnknownPage(): never {
  notFound();
}
