"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Generic single-field rename dialog. Mount it with a `key` so the input resets per target. */
export function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial,
  placeholder,
  maxLength = 120,
  allowEmpty = false,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initial: string;
  placeholder?: string;
  maxLength?: number;
  allowEmpty?: boolean;
  pending: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          id="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!allowEmpty && !trimmed) return;
            onSave(trimmed);
          }}
        >
          <Field>
            <FieldLabel htmlFor="rename-input">{label}</FieldLabel>
            <Input
              id="rename-input"
              value={value}
              maxLength={maxLength}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rename-form" disabled={pending || (!allowEmpty && !trimmed)}>
            {pending ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
