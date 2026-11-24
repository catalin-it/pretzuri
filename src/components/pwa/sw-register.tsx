"use client";

import { useEffect } from "react";

/** Registers the service worker (served by src/app/serwist/[path]/route.ts) in production builds only. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" }).catch(() => {
      /* not fatal: the site works without it */
    });
  }, []);
  return null;
}
