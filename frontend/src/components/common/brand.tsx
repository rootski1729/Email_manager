import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Envelope inside a watchful shield — the MailSentinel mark. A flat denim shield with a seashell
 * envelope and obsidian outline reads on seashell paper, white cards, the obsidian dark theme
 * and as a favicon. Colours mirror src/app/icon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <path
        d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.2 11.5-14.3V7L16 2.5Z"
        fill="#5e83ae"
      />
      <rect x="9.5" y="11" width="13" height="9.5" rx="1.8" fill="#f9f5ed" stroke="#2a2a2a" strokeWidth="1.8" />
      <path d="m10 12 6 4.6 6-4.6" fill="none" stroke="#2a2a2a" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BrandMark />
      {compact ? null : <span className="text-[15px]">{APP_NAME}</span>}
    </span>
  );
}
