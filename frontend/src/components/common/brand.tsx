import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Envelope inside a watchful shield — the MailSentinel mark. A flat iris shield with a white
 * envelope reads on white cards, the light sidebar, the near-black dark theme and as a favicon.
 * Colours mirror src/app/icon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <path
        d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.2 11.5-14.3V7L16 2.5Z"
        fill="#5a45dd"
        stroke="#5a45dd"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="9.25" y="11" width="13.5" height="9.5" rx="2" fill="#ffffff" />
      <path
        d="m10.6 12.6 5.4 4.1 5.4-4.1"
        fill="none"
        stroke="#5a45dd"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
