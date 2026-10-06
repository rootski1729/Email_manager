/** Calling codes for the phone input. Ordered by name; India is the default. */
export interface Country {
  iso: string;
  name: string;
  dial: string;
  flag: string;
}

const RAW: [string, string, string][] = [
  ["AE", "United Arab Emirates", "971"],
  ["AR", "Argentina", "54"],
  ["AU", "Australia", "61"],
  ["AT", "Austria", "43"],
  ["BD", "Bangladesh", "880"],
  ["BE", "Belgium", "32"],
  ["BR", "Brazil", "55"],
  ["CA", "Canada", "1"],
  ["CH", "Switzerland", "41"],
  ["CL", "Chile", "56"],
  ["CN", "China", "86"],
  ["CO", "Colombia", "57"],
  ["DE", "Germany", "49"],
  ["DK", "Denmark", "45"],
  ["EG", "Egypt", "20"],
  ["ES", "Spain", "34"],
  ["FI", "Finland", "358"],
  ["FR", "France", "33"],
  ["GB", "United Kingdom", "44"],
  ["GH", "Ghana", "233"],
  ["HK", "Hong Kong", "852"],
  ["ID", "Indonesia", "62"],
  ["IE", "Ireland", "353"],
  ["IL", "Israel", "972"],
  ["IN", "India", "91"],
  ["IT", "Italy", "39"],
  ["JP", "Japan", "81"],
  ["KE", "Kenya", "254"],
  ["KR", "South Korea", "82"],
  ["LK", "Sri Lanka", "94"],
  ["MX", "Mexico", "52"],
  ["MY", "Malaysia", "60"],
  ["NG", "Nigeria", "234"],
  ["NL", "Netherlands", "31"],
  ["NO", "Norway", "47"],
  ["NP", "Nepal", "977"],
  ["NZ", "New Zealand", "64"],
  ["PH", "Philippines", "63"],
  ["PK", "Pakistan", "92"],
  ["PL", "Poland", "48"],
  ["PT", "Portugal", "351"],
  ["QA", "Qatar", "974"],
  ["SA", "Saudi Arabia", "966"],
  ["SE", "Sweden", "46"],
  ["SG", "Singapore", "65"],
  ["TH", "Thailand", "66"],
  ["TR", "Türkiye", "90"],
  ["US", "United States", "1"],
  ["VN", "Vietnam", "84"],
  ["ZA", "South Africa", "27"],
];

function flag(iso: string) {
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const COUNTRIES: Country[] = RAW.map(([iso, name, dial]) => ({ iso, name, dial, flag: flag(iso) }));
export const DEFAULT_COUNTRY = "IN";

const E164 = /^\+[1-9]\d{6,14}$/;

/** Build an E.164 number from a country and what the user typed. A leading "+" wins. */
export function toE164(countryIso: string, input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    const n = `+${trimmed.replace(/\D/g, "")}`;
    return E164.test(n) ? n : null;
  }
  const country = COUNTRIES.find((c) => c.iso === countryIso);
  if (!country) return null;
  const national = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  const n = `+${country.dial}${national}`;
  return E164.test(n) ? n : null;
}
