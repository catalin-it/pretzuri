// User-facing changelog, newest first. Both languages are required (entries.test.ts enforces it).
export type ChangelogEntry = {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  items: { en: string[]; ro: string[] };
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.3.3",
    date: "2026-11-25",
    items: {
      en: ["The site now always uses a light theme (dark text on white), also on devices set to dark mode."],
      ro: ["Site-ul folosește acum mereu tema deschisă (text închis pe alb), și pe dispozitivele setate pe modul întunecat."],
    },
  },
  {
    version: "0.3.2",
    date: "2026-11-25",
    items: {
      en: [
        "The privacy policy and terms now describe the real service: accounts, favorites, price alerts, view history, reviews, retention periods, processors and your rights.",
        "The terms now explain affiliate links, review rules and how to report a review.",
      ],
      ro: [
        "Politica de confidențialitate și termenii descriu acum serviciul real: conturi, favorite, alerte de preț, istoric vizualizări, recenzii, perioade de păstrare, împuterniciți și drepturile tale.",
        "Termenii explică acum linkurile afiliate, regulile pentru recenzii și cum raportezi o recenzie.",
      ],
    },
  },
  {
    version: "0.3.1",
    date: "2026-11-25",
    items: {
      en: [
        "Prices in Romanian now read \"lei\" (for example 2.499,99 lei) instead of \"RON\".",
        "Setting a password now really requires the code sent by email; a wrong code is refused.",
        "Fixed: shops and feeds could not be saved from the admin area when the \"affiliate\" or \"active\" boxes were unchecked.",
        "Unknown addresses show the \"page not found\" page with working scripts.",
      ],
      ro: [
        "Prețurile în română apar acum cu „lei” (de exemplu 2.499,99 lei), nu cu „RON”.",
        "Setarea parolei cere acum cu adevărat codul primit pe email; un cod greșit este refuzat.",
        "Reparat: magazinele și feedurile nu se puteau salva din zona de administrare când bifele „afiliere” sau „activ” erau debifate.",
        "Adresele necunoscute afișează pagina „pagina nu există” cu scripturile funcționale.",
      ],
    },
  },
  {
    version: "0.3.0",
    date: "2026-11-25",
    items: {
      en: [
        "Accounts: sign in with a code sent by email, optional password, account settings, data download and account deletion.",
        "Favorites and viewing history (last 90 days) in your account.",
        "Price alerts by email or notification: set a target price on a product page and we tell you when the total price drops to it.",
        "Shop reviews: write and edit your review (published after moderation) and report reviews.",
        "Admin area for the team (two-step sign-in): shops and feeds, category mapping, duplicate products, review moderation, users and settings.",
      ],
      ro: [
        "Conturi: autentificare cu un cod primit pe email, parolă opțională, setări, descărcarea datelor și ștergerea contului.",
        "Produse favorite și istoricul vizualizărilor (ultimele 90 de zile) în contul tău.",
        "Alerte de preț pe email sau prin notificare: alegi un preț țintă pe pagina produsului și te anunțăm când prețul total ajunge la el.",
        "Recenzii pentru magazine: scrii și modifici recenzia ta (publicată după moderare) și poți raporta recenzii.",
        "Zonă de administrare pentru echipă (autentificare în doi pași): magazine și feeduri, maparea categoriilor, produse duplicate, moderarea recenziilor, utilizatori și setări.",
      ],
    },
  },
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
