import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

// One manifest per origin: name and description use the default locale (ro). `start_url: "/"` is redirected by the
// next-intl proxy to the user's locale.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "Pwa" });
  return {
    id: "/",
    name: "Pretzuri",
    short_name: "Pretzuri",
    description: t("description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b6e4f",
    categories: ["shopping"],
    lang: "ro",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
