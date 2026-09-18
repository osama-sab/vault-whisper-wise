/**
 * Merchant logo database — geometric SVG brand representations
 * using official brand colors. Matched by normalized payee text.
 *
 * Each entry: { keywords: string[], color: string, abbrev: string, label: string }
 *   keywords — lowercase substrings to match against payee
 *   color    — primary brand hex
 *   abbrev   — 1-3 chars shown inside the circle
 *   label    — canonical display name
 */

export interface MerchantInfo {
  keywords: string[];
  color: string;
  abbrev: string;
  label: string;
}

export const MERCHANTS: MerchantInfo[] = [
  // ─── GERMAN GROCERIES ────────────────────────────────
  { keywords: ["rewe"],                color: "#CC0000", abbrev: "R",   label: "REWE" },
  { keywords: ["lidl"],                color: "#0050AA", abbrev: "L",   label: "Lidl" },
  { keywords: ["aldi"],                color: "#00599D", abbrev: "A",   label: "Aldi" },
  { keywords: ["edeka"],               color: "#FFE500", abbrev: "E",   label: "Edeka" },
  { keywords: ["penny"],               color: "#CD1719", abbrev: "P",   label: "Penny" },
  { keywords: ["kaufland"],            color: "#E30613", abbrev: "K",   label: "Kaufland" },
  { keywords: ["netto"],               color: "#FFD700", abbrev: "N",   label: "Netto" },
  { keywords: ["norma"],               color: "#E30613", abbrev: "N",   label: "Norma" },
  { keywords: ["real"],                color: "#E20714", abbrev: "R",   label: "Real" },
  { keywords: ["globus"],              color: "#006F3A", abbrev: "G",   label: "Globus" },
  { keywords: ["tegut"],               color: "#E2001A", abbrev: "T",   label: "Tegut" },
  { keywords: ["nahkauf"],             color: "#CC0000", abbrev: "Nk",  label: "Nahkauf" },
  { keywords: ["bio company", "biocompany"], color: "#6B8E23", abbrev: "BC", label: "Bio Company" },

  // ─── DRUGSTORES & PHARMACIES ─────────────────────────
  { keywords: ["dm-drogerie", "dm drogerie", "dm fil"], color: "#002F6C", abbrev: "dm", label: "DM" },
  { keywords: ["rossmann"],            color: "#E30613", abbrev: "Ro",  label: "Rossmann" },
  { keywords: ["mueller drogerie", "müller drogerie"], color: "#1D4370", abbrev: "Mü", label: "Müller" },
  { keywords: ["apotheke"],            color: "#D4001E", abbrev: "Ap",  label: "Apotheke" },
  { keywords: ["douglas"],             color: "#000000", abbrev: "D",   label: "Douglas" },

  // ─── HEALTH INSURANCE ────────────────────────────────
  { keywords: ["aok"],                 color: "#009640", abbrev: "AO",  label: "AOK" },
  { keywords: ["dak"],                 color: "#E30613", abbrev: "DA",  label: "DAK" },
  { keywords: ["tk ", "techniker krankenkasse"], color: "#003C8F", abbrev: "TK", label: "TK" },
  { keywords: ["barmer"],              color: "#00A3E0", abbrev: "Ba",  label: "Barmer" },
  { keywords: ["ikk"],                 color: "#009FE3", abbrev: "IK",  label: "IKK" },
  { keywords: ["hkk"],                 color: "#004F9E", abbrev: "hk",  label: "HKK" },

  // ─── STREAMING & ENTERTAINMENT ───────────────────────
  { keywords: ["netflix"],             color: "#E50914", abbrev: "N",   label: "Netflix" },
  { keywords: ["spotify"],             color: "#1DB954", abbrev: "S",   label: "Spotify" },
  { keywords: ["disney plus", "disney+", "disneyplus"], color: "#113CCF", abbrev: "D+", label: "Disney+" },
  { keywords: ["amazon prime", "prime video"], color: "#00A8E1", abbrev: "AP", label: "Amazon Prime" },
  { keywords: ["apple tv", "apple.com/bill", "itunes"], color: "#555555", abbrev: "A",  label: "Apple" },
  { keywords: ["youtube", "google youtube"], color: "#FF0000", abbrev: "YT",  label: "YouTube" },
  { keywords: ["hbo", "max.com"],      color: "#5822B4", abbrev: "H",   label: "HBO Max" },
  { keywords: ["dazn"],                color: "#F5F5DC", abbrev: "DA",  label: "DAZN" },
  { keywords: ["audible"],             color: "#F8991D", abbrev: "Au",  label: "Audible" },
  { keywords: ["crunchyroll"],         color: "#F47521", abbrev: "CR",  label: "Crunchyroll" },
  { keywords: ["twitch"],              color: "#9146FF", abbrev: "Tw",  label: "Twitch" },
  { keywords: ["sky "],                color: "#004B87", abbrev: "Sk",  label: "Sky" },
  { keywords: ["waipu"],               color: "#7B2D8E", abbrev: "W",   label: "Waipu.tv" },

  // ─── ONLINE SHOPPING ─────────────────────────────────
  { keywords: ["amazon", "amzn"],      color: "#FF9900", abbrev: "Az",  label: "Amazon" },
  { keywords: ["zalando"],             color: "#FF6900", abbrev: "Z",   label: "Zalando" },
  { keywords: ["otto"],                color: "#E63312", abbrev: "Ot",  label: "Otto" },
  { keywords: ["ebay"],                color: "#E53238", abbrev: "eB",  label: "eBay" },
  { keywords: ["aliexpress", "ali express"], color: "#E43225", abbrev: "AE", label: "AliExpress" },
  { keywords: ["temu"],                color: "#FB7701", abbrev: "Te",  label: "Temu" },
  { keywords: ["shein"],               color: "#000000", abbrev: "SH",  label: "Shein" },
  { keywords: ["etsy"],                color: "#F1641E", abbrev: "Et",  label: "Etsy" },
  { keywords: ["about you"],           color: "#FF6B00", abbrev: "AY",  label: "About You" },

  // ─── FASHION & RETAIL ────────────────────────────────
  { keywords: ["h&m", "h und m", "hm "], color: "#E50010", abbrev: "HM", label: "H&M" },
  { keywords: ["zara"],                color: "#000000", abbrev: "ZA",  label: "Zara" },
  { keywords: ["primark"],             color: "#004687", abbrev: "Pr",  label: "Primark" },
  { keywords: ["uniqlo"],              color: "#FF0000", abbrev: "UQ",  label: "Uniqlo" },
  { keywords: ["c&a", "c und a"],      color: "#00568A", abbrev: "CA",  label: "C&A" },
  { keywords: ["tk maxx", "tkmaxx"],   color: "#E21836", abbrev: "TK",  label: "TK Maxx" },
  { keywords: ["decathlon"],           color: "#0082C3", abbrev: "De",  label: "Decathlon" },
  { keywords: ["nike"],                color: "#000000", abbrev: "NK",  label: "Nike" },
  { keywords: ["adidas"],              color: "#000000", abbrev: "Ad",  label: "Adidas" },
  { keywords: ["deichmann"],           color: "#E30613", abbrev: "Dc",  label: "Deichmann" },

  // ─── ELECTRONICS & HOME IMPROVEMENT ──────────────────
  { keywords: ["mediamarkt", "media markt"], color: "#DF0000", abbrev: "MM", label: "MediaMarkt" },
  { keywords: ["saturn"],              color: "#004F9F", abbrev: "Sa",  label: "Saturn" },
  { keywords: ["obi "],                color: "#F58220", abbrev: "OB",  label: "OBI" },
  { keywords: ["bauhaus"],             color: "#E30613", abbrev: "BH",  label: "Bauhaus" },
  { keywords: ["hornbach"],            color: "#F07D00", abbrev: "HB",  label: "Hornbach" },
  { keywords: ["toom"],                color: "#0069B4", abbrev: "To",  label: "Toom" },
  { keywords: ["ikea"],                color: "#0058A3", abbrev: "IK",  label: "IKEA" },
  { keywords: ["poco"],                color: "#D40000", abbrev: "PC",  label: "Poco" },
  { keywords: ["roller"],              color: "#003DA5", abbrev: "Rl",  label: "Roller" },
  { keywords: ["apple store"],         color: "#555555", abbrev: "A",   label: "Apple Store" },

  // ─── FOOD DELIVERY ───────────────────────────────────
  { keywords: ["lieferando"],          color: "#FF8000", abbrev: "Li",  label: "Lieferando" },
  { keywords: ["wolt"],                color: "#009DE0", abbrev: "Wo",  label: "Wolt" },
  { keywords: ["uber eats", "ubereats"], color: "#06C167", abbrev: "UE", label: "Uber Eats" },
  { keywords: ["flink"],               color: "#D42A6B", abbrev: "Fl",  label: "Flink" },
  { keywords: ["gorillas"],            color: "#000000", abbrev: "Go",  label: "Gorillas" },
  { keywords: ["getir"],               color: "#5D3EBC", abbrev: "Ge",  label: "Getir" },
  { keywords: ["dominos", "domino's"], color: "#006491", abbrev: "Do",  label: "Domino's" },
  { keywords: ["mcdonalds", "mcdonald", "mcd "], color: "#FFC72C", abbrev: "Mc", label: "McDonald's" },
  { keywords: ["burger king"],         color: "#D62300", abbrev: "BK",  label: "Burger King" },
  { keywords: ["subway"],              color: "#008C15", abbrev: "Su",  label: "Subway" },
  { keywords: ["starbucks"],           color: "#006241", abbrev: "St",  label: "Starbucks" },
  { keywords: ["backwerk"],            color: "#D4A017", abbrev: "Bw",  label: "BackWerk" },

  // ─── TRANSPORT ────────────────────────────────────────
  { keywords: ["deutsche bahn", "db vertrieb", "db fernverkehr"], color: "#EC0016", abbrev: "DB", label: "Deutsche Bahn" },
  { keywords: ["bvg"],                 color: "#F0D722", abbrev: "BV",  label: "BVG" },
  { keywords: ["mvv", "mvg"],          color: "#00586C", abbrev: "MV",  label: "MVV" },
  { keywords: ["hvv"],                 color: "#DA291C", abbrev: "HV",  label: "HVV" },
  { keywords: ["vrs", "kvb"],          color: "#E30613", abbrev: "KV",  label: "KVB" },
  { keywords: ["flixbus", "flixtrain"], color: "#73D700", abbrev: "Fx", label: "FlixBus" },
  { keywords: ["uber "],               color: "#000000", abbrev: "Ub",  label: "Uber" },
  { keywords: ["bolt"],                color: "#34D186", abbrev: "Bl",  label: "Bolt" },
  { keywords: ["tier "],               color: "#0E1A2A", abbrev: "Ti",  label: "Tier" },
  { keywords: ["lime"],                color: "#00DE00", abbrev: "Lm",  label: "Lime" },
  { keywords: ["shell"],               color: "#FFD500", abbrev: "Sh",  label: "Shell" },
  { keywords: ["aral"],                color: "#0063AF", abbrev: "Ar",  label: "Aral" },
  { keywords: ["total energies", "totalenergies"], color: "#ED1C24", abbrev: "TE", label: "TotalEnergies" },
  { keywords: ["jet tankstelle", "jet "], color: "#FFD800", abbrev: "Jt", label: "JET" },
  { keywords: ["sixt"],                color: "#EF6C00", abbrev: "Si",  label: "Sixt" },

  // ─── SHIPPING & POST ─────────────────────────────────
  { keywords: ["dhl"],                 color: "#FFCC00", abbrev: "DH",  label: "DHL" },
  { keywords: ["hermes"],              color: "#009EE0", abbrev: "He",  label: "Hermes" },
  { keywords: ["dpd"],                 color: "#DC0032", abbrev: "DP",  label: "DPD" },
  { keywords: ["gls"],                 color: "#F5BD1F", abbrev: "GL",  label: "GLS" },
  { keywords: ["ups"],                 color: "#351C15", abbrev: "UP",  label: "UPS" },
  { keywords: ["deutsche post"],       color: "#FFCC00", abbrev: "Po",  label: "Deutsche Post" },

  // ─── TELECOMS & INTERNET ──────────────────────────────
  { keywords: ["telekom", "t-mobile"], color: "#E20074", abbrev: "T",   label: "Telekom" },
  { keywords: ["vodafone"],            color: "#E60000", abbrev: "Vf",  label: "Vodafone" },
  { keywords: ["o2 ", "telefonica"],   color: "#002E6E", abbrev: "O2",  label: "O2" },
  { keywords: ["1und1", "1&1"],        color: "#003A70", abbrev: "11",  label: "1&1" },
  { keywords: ["congstar"],            color: "#000000", abbrev: "Cg",  label: "Congstar" },
  { keywords: ["aldi talk"],           color: "#00599D", abbrev: "AT",  label: "Aldi Talk" },
  { keywords: ["freenet"],             color: "#00A3E0", abbrev: "Fn",  label: "Freenet" },

  // ─── UTILITIES & ENERGY ───────────────────────────────
  { keywords: ["eon ", "e.on"],        color: "#EA1B0A", abbrev: "Eo",  label: "E.ON" },
  { keywords: ["vattenfall"],          color: "#FFD200", abbrev: "Va",  label: "Vattenfall" },
  { keywords: ["enercity"],            color: "#009640", abbrev: "En",  label: "Enercity" },
  { keywords: ["rwe"],                 color: "#009EE0", abbrev: "RW",  label: "RWE" },
  { keywords: ["stadtwerke"],          color: "#0072BC", abbrev: "SW",  label: "Stadtwerke" },
  { keywords: ["naturstrom"],          color: "#6DB33F", abbrev: "Ns",  label: "Naturstrom" },
  { keywords: ["gez", "rundfunkbeitrag", "ard zdf"], color: "#003882", abbrev: "GZ", label: "GEZ / Rundfunk" },

  // ─── FINANCE & PAYMENTS ───────────────────────────────
  { keywords: ["paypal"],              color: "#003087", abbrev: "PP",  label: "PayPal" },
  { keywords: ["klarna"],              color: "#FFB3C7", abbrev: "Kl",  label: "Klarna" },
  { keywords: ["n26"],                 color: "#36A18B", abbrev: "26",  label: "N26" },
  { keywords: ["ing diba", "ing-diba", "ing "], color: "#FF6200", abbrev: "IN", label: "ING" },
  { keywords: ["commerzbank"],         color: "#FFD700", abbrev: "CB",  label: "Commerzbank" },
  { keywords: ["sparkasse"],           color: "#FF0000", abbrev: "Sp",  label: "Sparkasse" },
  { keywords: ["volksbank", "vr bank"], color: "#003399", abbrev: "VR", label: "Volksbank" },
  { keywords: ["dkb"],                 color: "#003E7E", abbrev: "DK",  label: "DKB" },
  { keywords: ["wise", "transferwise"], color: "#9FE870", abbrev: "Wi",  label: "Wise" },
  { keywords: ["revolut"],             color: "#0075EB", abbrev: "Rv",  label: "Revolut" },
  { keywords: ["check24"],             color: "#063773", abbrev: "24",  label: "Check24" },

  // ─── SOFTWARE & DIGITAL SERVICES ──────────────────────
  { keywords: ["google"],              color: "#4285F4", abbrev: "G",   label: "Google" },
  { keywords: ["microsoft", "msft"],   color: "#00A4EF", abbrev: "Ms",  label: "Microsoft" },
  { keywords: ["adobe"],               color: "#FF0000", abbrev: "Ad",  label: "Adobe" },
  { keywords: ["dropbox"],             color: "#0061FF", abbrev: "Db",  label: "Dropbox" },
  { keywords: ["openai", "chatgpt"],   color: "#10A37F", abbrev: "AI",  label: "OpenAI" },
  { keywords: ["notion"],              color: "#000000", abbrev: "No",  label: "Notion" },
  { keywords: ["canva"],               color: "#00C4CC", abbrev: "Cv",  label: "Canva" },
  { keywords: ["github"],              color: "#333333", abbrev: "GH",  label: "GitHub" },
  { keywords: ["icloud"],              color: "#3693F3", abbrev: "iC",  label: "iCloud" },

  // ─── FITNESS & WELLNESS ───────────────────────────────
  { keywords: ["mcfit", "mc fit"],     color: "#FFD700", abbrev: "Mc",  label: "McFit" },
  { keywords: ["fitness first"],       color: "#E30613", abbrev: "FF",  label: "Fitness First" },
  { keywords: ["urban sports"],        color: "#FF5100", abbrev: "US",  label: "Urban Sports" },
  { keywords: ["john reed"],           color: "#000000", abbrev: "JR",  label: "John Reed" },
  { keywords: ["clever fit"],          color: "#E72E2D", abbrev: "CF",  label: "Clever Fit" },

  // ─── MISCELLANEOUS ────────────────────────────────────
  { keywords: ["miete", "vermieter"],  color: "#607D8B", abbrev: "Mi",  label: "Miete" },
  { keywords: ["kindergarten", "kita"], color: "#4CAF50", abbrev: "Ki", label: "Kita" },
];

// Lookup index for fast matching
const _index: { kw: string; m: MerchantInfo }[] = [];
for (const m of MERCHANTS) {
  for (const kw of m.keywords) {
    _index.push({ kw, m });
  }
}
// Sort longest keyword first to prefer more specific matches
_index.sort((a, b) => b.kw.length - a.kw.length);

/**
 * Keywords are matched on word boundaries, not as bare substrings.
 *
 * Plain `includes()` made short keywords match inside unrelated words:
 * "PARKING GEBUEHR" and "SHOPPING CENTER" both contain "ing " and were tagged
 * as ING bank (and so filed under savings); "ERWERB" contains "rwe" and was
 * tagged RWE; "Montreal" contains "real". A boundary here is any
 * non-alphanumeric character or the start/end of the string, so "netflix.com"
 * still matches "netflix" and "REWE-MARKT" still matches "rewe".
 */
const _matchers: { re: RegExp; m: MerchantInfo }[] = _index.map(({ kw, m }) => ({
  re: new RegExp(`(^|[^a-z0-9])${kw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i"),
  m,
}));

/** Match a payee string to a merchant */
export function findMerchant(payee: string): MerchantInfo | null {
  if (!payee) return null;
  const s = String(payee);
  for (const { re, m } of _matchers) {
    if (re.test(s)) return m;
  }
  return null;
}

// ─── CATEGORY ICONS (used next to category type labels) ────────────────
// Returns an SVG path for each CategoryType
import type { CategoryType } from "./types";

export const CATEGORY_ICONS: Record<CategoryType, { path: string; color: string }> = {
  income:   { path: "M12 2v16m0-16l-5 5m5-5l5 5M5 22h14", color: "#10B981" },
  bills:    { path: "M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", color: "#8B5CF6" },
  expenses: { path: "M3 3h18v4H3zm0 6h18v4H3zm0 6h18v4H3z", color: "#EF4444" },
  savings:  { path: "M19 10c0-2.76-2.24-5-5-5-.55 0-1.09.1-1.58.27A4.98 4.98 0 008 3C5.24 3 3 5.24 3 8c0 .93.26 1.8.7 2.55C2.63 11.88 2 13.37 2 15c0 3.31 2.69 6 6 6 1.23 0 2.37-.38 3.32-1.02A5.96 5.96 0 0016 21c2.76 0 5-2.24 5-5 0-1.63-.63-3.12-1.7-4.45.44-.75.7-1.62.7-2.55z", color: "#0EA5E9" },
  debt:     { path: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M16.95 16.95l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M16.95 7.05l1.42-1.42M12 6a6 6 0 100 12 6 6 0 000-12zm-1 4h2v4h-2z", color: "#F59E0B" },
};
