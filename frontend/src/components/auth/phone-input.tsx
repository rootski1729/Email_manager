"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";

export function PhoneInput({
  id,
  country,
  onCountryChange,
  value,
  onChange,
  invalid,
  disabled,
  autoFocus,
}: {
  id: string;
  country: string;
  onCountryChange: (iso: string) => void;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const overridden = value.trim().startsWith("+");
  return (
    <div className="flex gap-2">
      <Select value={country} onValueChange={onCountryChange} disabled={disabled || overridden}>
        <SelectTrigger className="w-[7.5rem] shrink-0" aria-label="Country calling code">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.iso}>
              <span aria-hidden>{c.flag}</span>
              <span className="tabular">+{c.dial}</span>
              <span className="sr-only">{c.name}</span>
              <span className="ml-1 hidden text-muted-foreground sm:inline">{c.iso}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="98765 43210"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        className="tabular"
      />
    </div>
  );
}
