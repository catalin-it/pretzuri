// User-facing changelog, newest first. Both languages are required (entries.test.ts enforces it).
export type ChangelogEntry = {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  items: { en: string[]; ro: string[] };
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-11-25",
    items: {
      en: [
        "Search and category pages with filters (price, brand, shop, specifications), sorting and pages.",
        "Product page: offers ordered by total price, lowest price of the last 30 days, price history chart, specifications.",
        "Compare up to 4 products, shop pages with reviews, and the \"How we rank offers\" and affiliate pages.",
      ],
      ro: [
        "Căutare și pagini de categorie cu filtre (preț, marcă, magazin, specificații), ordonare și paginare.",
        "Pagina produsului: oferte ordonate după prețul total, cel mai mic preț din ultimele 30 de zile, grafic de preț, specificații.",
        "Comparație până la 4 produse, pagini de magazin cu recenzii și paginile \"Cum ordonăm ofertele\" și despre afiliere.",
      ],
    },
  },
  {
    version: "0.1.0",
    date: "2026-11-25",
    items: {
      en: ["First DEV version: app skeleton, Romanian and English, installable app."],
      ro: ["Prima versiune DEV: scheletul aplicației, română și engleză, aplicație instalabilă."],
    },
  },
];
