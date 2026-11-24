// User-facing changelog, newest first. Both languages are required (entries.test.ts enforces it).
export type ChangelogEntry = {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  items: { en: string[]; ro: string[] };
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-11-25",
    items: {
      en: ["First DEV version: app skeleton, Romanian and English, installable app."],
      ro: ["Prima versiune DEV: scheletul aplicației, română și engleză, aplicație instalabilă."],
    },
  },
];
