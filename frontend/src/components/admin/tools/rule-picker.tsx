"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { phoneDisplay } from "@/lib/admin/labels";
import type { AdminRuleRow } from "@/lib/admin/types";

/** Searchable list of every client's rules; picking one loads its condition. */
export function RulePicker({
  rules,
  loading,
  onPick,
}: {
  rules: AdminRuleRow[];
  loading: boolean;
  onPick: (rule: AdminRuleRow) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} disabled={loading}>
          Load a client&apos;s rule <ChevronsUpDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search rules or clients…" />
          <CommandList>
            <CommandEmpty>No rules found.</CommandEmpty>
            <CommandGroup>
              {rules.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.name} ${r.owner_name ?? ""} ${r.owner_phone ?? ""} ${r.id}`}
                  onSelect={() => {
                    onPick(r);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.owner_name || phoneDisplay(r.owner_phone)}
                      {r.enabled ? "" : " · off"}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
