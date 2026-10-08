/**
 * Soft per-sender colour: a pastel surface with a darker ink of the same hue (tokens `--tint-*` in
 * globals.css; every ink passes WCAG AA on its tint in light and dark). The hue is picked from a hash of the
 * name, so the same sender always gets the same colour.
 */
const TINTS = [
  "bg-tint-iris text-tint-iris-ink",
  "bg-tint-teal text-tint-teal-ink",
  "bg-tint-amber text-tint-amber-ink",
  "bg-tint-rose text-tint-rose-ink",
  "bg-tint-sky text-tint-sky-ink",
  "bg-tint-green text-tint-green-ink",
] as const;

function hash(s: string): number {
  // FNV-1a: small, fast and spreads similar names well.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tintFor(seed: string | null | undefined): string {
  const key = (seed ?? "").trim().toLowerCase();
  return TINTS[key ? hash(key) % TINTS.length : 0];
}
