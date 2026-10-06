import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Envelope inside a watchful shield — the MailSentinel mark. Moonstone shield with a gunmetal
 * envelope reads on champagne paper, on gunmetal (sidebar, dark mode) and as a favicon.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <defs>
        <linearGradient id="ms-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc3ca" />
          <stop offset="1" stopColor="#6a9ca6" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.2 11.5-14.3V7L16 2.5Z"
        fill="url(#ms-g)"
      />
      <rect x="9.5" y="11" width="13" height="9.5" rx="1.8" fill="#f5e4c8" stroke="#1b242a" strokeWidth="1.8" />
      <path d="m10 12 6 4.6 6-4.6" fill="none" stroke="#1b242a" strokeWidth="1.8" strokeLinejoin="round" />
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
