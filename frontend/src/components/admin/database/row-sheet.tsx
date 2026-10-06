"use client";

import { Lock, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteDbRow, useEditDbRow } from "@/lib/admin/queries";
import type { DbColumn, DbTable } from "@/lib/admin/types";
import { HIDDEN_MASK, cellText, draftOf, enumOptions, valueOf } from "./cell";

type Row = Record<string, unknown>;
const EMPTY = "__empty__";

function ReadOnlyValue({ col, value }: { col: DbColumn; value: unknown }) {
  if (col.hidden) return <p className="font-mono text-sm text-muted-foreground">{value == null ? "—" : HIDDEN_MASK}</p>;
  if (value !== null && typeof value === "object") {
    return (
      <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <p className="text-sm break-all">{cellText(col, value)}</p>;
}

function Editor({
  col,
  value,
  onChange,
}: {
  col: DbColumn;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const id = `db-${col.name}`;
  const options = enumOptions(col.type);
  if (col.type === "boolean") {
    return <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />;
  }
  if (options) {
    return (
      <Select value={String(value) || EMPTY} onValueChange={(v) => onChange(v === EMPTY ? "" : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {col.nullable ? <SelectItem value={EMPTY}>(empty)</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (col.type === "json") {
    return (
      <Textarea id={id} rows={5} className="font-mono text-xs" spellCheck={false} value={String(value)} onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (col.type === "integer" || col.type === "number") {
    return (
      <Input
        id={id}
        type="number"
        inputMode={col.type === "integer" ? "numeric" : "decimal"}
        step={col.type === "integer" ? 1 : "any"}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const long = col.type === "text" && String(value).length > 80;
  if (long) return <Textarea id={id} rows={4} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Input
      id={id}
      value={String(value)}
      spellCheck={col.type === "text"}
      placeholder={col.type === "datetime" ? "2026-10-12T10:00:00+05:30" : col.type === "array" ? "a, b, c" : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function hint(col: DbColumn): string | null {
  if (col.type === "datetime") return "ISO date and time with a timezone, e.g. 2026-10-12T10:00:00+05:30";
  if (col.type === "array") return "Comma-separated, or a JSON array.";
  if (col.type === "json") return "JSON.";
  return null;
}

function RowEditor({
  table,
  row,
  pkName,
  onSaved,
  onDeleted,
}: {
  table: DbTable;
  row: Row;
  pkName: string;
  onSaved: (row: Row) => void;
  onDeleted: () => void;
}) {
  const pk = String(row[pkName]);
  const edit = useEditDbRow(table.name);
  const del = useDeleteDbRow(table.name);
  const initial = useMemo(
    () => Object.fromEntries(table.columns.map((c) => [c.name, draftOf(c, row[c.name])])),
    [table.columns, row],
  );
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editable = (c: DbColumn) => table.can_edit && c.editable && !c.hidden;
  const changed = table.columns.filter((c) => editable(c) && drafts[c.name] !== initial[c.name]);

  const save = () => {
    setError(null);
    let values: Record<string, unknown>;
    try {
      values = Object.fromEntries(changed.map((c) => [c.name, valueOf(c, drafts[c.name])]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the values");
      return;
    }
    edit.mutate(
      { pk, values },
      {
        onSuccess: (updated) => {
          toast.success(`Saved ${changed.length} ${changed.length === 1 ? "change" : "changes"}`);
          onSaved(updated);
        },
      },
    );
  };

  const ordered = [...table.columns].sort((a, b) => Number(editable(b)) - Number(editable(a)));

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <FieldGroup className="gap-4">
          {ordered.map((c) => (
            <Field key={c.name}>
              <FieldLabel htmlFor={editable(c) ? `db-${c.name}` : undefined} className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs">{c.name}</span>
                <Badge variant="outline" className="font-normal">
                  {c.type.startsWith("enum:") ? "choice" : c.type}
                </Badge>
                {c.primary_key ? <Badge variant="secondary">key</Badge> : null}
                {!editable(c) ? <Lock className="size-3 text-muted-foreground" aria-label="Read-only" /> : null}
                {editable(c) && drafts[c.name] !== initial[c.name] ? <Badge>changed</Badge> : null}
              </FieldLabel>
              {editable(c) ? (
                <>
                  <Editor col={c} value={drafts[c.name]} onChange={(v) => setDrafts((d) => ({ ...d, [c.name]: v }))} />
                  {hint(c) ? <FieldDescription>{hint(c)}</FieldDescription> : null}
                </>
              ) : (
                <ReadOnlyValue col={c} value={row[c.name]} />
              )}
            </Field>
          ))}
        </FieldGroup>
      </div>
      <SheetFooter className="border-t">
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="flex flex-wrap gap-2">
          {table.can_edit ? (
            <Button onClick={save} disabled={changed.length === 0 || edit.isPending}>
              {edit.isPending ? <Spinner /> : <Save />} Save {changed.length > 0 ? `(${changed.length})` : ""}
            </Button>
          ) : null}
          {table.can_delete ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={del.isPending}>
              <Trash2 /> Delete row
            </Button>
          ) : null}
        </div>
      </SheetFooter>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this row?"
        description={
          table.name === "users" ? (
            <>
              This deletes the client <span className="font-medium text-foreground">and everything they own</span>:
              mailboxes, rules, matched emails, WhatsApp history and dates. It can&apos;t be undone.
            </>
          ) : (
            <>Rows in other tables that depend on this one may be deleted too. This can&apos;t be undone.</>
          )
        }
        confirmLabel="Delete row"
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(pk, {
            onSuccess: () => {
              toast.success("Row deleted");
              setConfirmDelete(false);
              onDeleted();
            },
          })
        }
      />
    </>
  );
}

export function RowSheet({
  table,
  row,
  onOpenChange,
  onSaved,
}: {
  table: DbTable;
  row: Row | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: Row) => void;
}) {
  const pkName = table.columns.find((c) => c.primary_key)?.name ?? "id";
  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{table.label}</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">
            {pkName} = {row ? String(row[pkName]) : ""}
          </SheetDescription>
          {!table.can_edit ? (
            <p className="text-xs text-muted-foreground">This table is read-only here.</p>
          ) : null}
        </SheetHeader>
        {row ? (
          <RowEditor
            key={JSON.stringify(row)}
            table={table}
            row={row}
            pkName={pkName}
            onSaved={onSaved}
            onDeleted={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
