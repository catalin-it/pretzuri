import type { MetadataRoute } from "next";
import { NOINDEX, SITE_URL } from "@/lib/app-version";

export default function robots(): MetadataRoute.Robots {
  if (NOINDEX) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/go/", "/api/", "/ro/cont", "/en/cont", "/ro/admin", "/en/admin"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
