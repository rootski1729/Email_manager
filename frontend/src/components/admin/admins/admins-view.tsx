"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Pencil, Power, ShieldCheck, UserPlus, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TableSkeleton } from "@/components/admin/common/table-skeleton";
import { ToneBadge } from "@/components/admin/common/tone-badge";
import { ChangePasswordDialog } from "@/components/admin/shell/change-password-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/errors";
import { useAdminAuth } from "@/lib/admin/auth-provider";
import { adminsQuery, useCreateAdmin, useUpdateAdmin } from "@/lib/admin/queries";
import { updateAdminProfile } from "@/lib/admin/session";
import type { AdminOut } from "@/lib/admin/types";
import { initials } from "@/lib/format";

const USERNAME = /^[a-z0-9._-]{3,64}$/;
const MIN_PASSWORD = 10;

function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function AddAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAdmin();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const badUser = username.length > 0 && !USERNAME.test(username);
  const shortPw = password.length > 0 && password.length < MIN_PASSWORD;
  const can = USERNAME.test(username) && password.length >= MIN_PASSWORD && !create.isPending;

  const reset = () => {
    setUsername("");
    setName("");
    setPassword("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an admin</DialogTitle>
          <DialogDescription>Admins can see and change everything. Share the password privately.</DialogDescription>
        </DialogHeader>
        <form
          id="add-admin"
          onSubmit={(e) => {
            e.preventDefault();
            if (!can) return;
            setError(null);
            create.mutate(
              { username, display_name: name.trim() || null, password },
              {
                onSuccess: () => {
                  toast.success(`Admin ${username} added`);
                  reset();
                  onOpenChange(false);
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
        >
          <FieldGroup>
            <Field data-invalid={badUser || undefined}>
              <FieldLabel htmlFor="aa-username">Username</FieldLabel>
              <Input
                id="aa-username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                aria-invalid={badUser || undefined}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
              {badUser ? (
                <FieldError>3–64 characters: lowercase letters, numbers, dots, dashes or underscores.</FieldError>
              ) : (
                <FieldDescription>Used to sign in, e.g. priya or ops.team</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="aa-name">Display name (optional)</FieldLabel>
              <Input id="aa-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field data-invalid={shortPw || undefined}>
              <FieldLabel htmlFor="aa-password">Password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="aa-password"
                  type="text"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="font-mono"
                  value={password}
                  aria-invalid={shortPw || undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="xs" onClick={() => setPassword(generatePassword())}>
                    <Wand2 /> Generate
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {shortPw ? (
                <FieldError>At least {MIN_PASSWORD} characters.</FieldError>
              ) : (
                <FieldDescription>At least {MIN_PASSWORD} characters. They can change it after signing in.</FieldDescription>
              )}
            </Field>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="add-admin" disabled={!can}>
            {create.isPending ? <Spinner /> : null} Add admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ admin, onClose }: { admin: AdminOut | null; onClose: () => void }) {
  const update = useUpdateAdmin();
  const { admin: me } = useAdminAuth();
  const [name, setName] = useState(admin?.display_name ?? "");
  return (
    <Dialog open={admin !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change display name</DialogTitle>
          <DialogDescription>Shown in the console and the activity log menu. The username stays the same.</DialogDescription>
        </DialogHeader>
        <form
          id="rename-admin"
          onSubmit={(e) => {
            e.preventDefault();
            if (!admin) return;
            update.mutate(
              { id: admin.id, display_name: name.trim() || null },
              {
                onSuccess: (updated) => {
                  if (updated.id === me?.id) updateAdminProfile(updated);
                  toast.success("Name updated");
                  onClose();
                },
              },
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor="rename-admin-name">Display name</FieldLabel>
            <Input id="rename-admin-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="rename-admin" disabled={update.isPending}>
            {update.isPending ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminsView() {
  const { admin: me } = useAdminAuth();
  const list = useQuery(adminsQuery);
  const update = useUpdateAdmin();
  const [adding, setAdding] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [renaming, setRenaming] = useState<AdminOut | null>(null);
  const [disabling, setDisabling] = useState<AdminOut | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admins"
        description="People who can sign in to this console. Every admin has full access."
        className="pb-0"
        actions={
          <>
            <Button variant="outline" onClick={() => setPwOpen(true)}>
              <KeyRound /> Change my password
            </Button>
            <Button onClick={() => setAdding(true)}>
              <UserPlus /> Add admin
            </Button>
          </>
        }
      />
      {list.isPending ? (
        <TableSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No admins" description="Add the first admin to share the work." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Last sign-in</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((a) => {
                const isMe = a.id === me?.id;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(a.display_name || a.username, "A")}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{a.display_name || a.username}</span>
                            {isMe ? <Badge variant="secondary">You</Badge> : null}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{a.username}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <ToneBadge tone={a.is_active ? "success" : "neutral"}>{a.is_active ? "Active" : "Disabled"}</ToneBadge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      <RelativeTime iso={a.last_login_at} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <RelativeTime iso={a.created_at} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.username}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setRenaming(a)}>
                            <Pencil /> Change display name
                          </DropdownMenuItem>
                          {isMe ? (
                            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                              <KeyRound /> Change my password
                            </DropdownMenuItem>
                          ) : a.is_active ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setDisabling(a)}>
                              <Power /> Disable
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() =>
                                update.mutate(
                                  { id: a.id, is_active: true },
                                  { onSuccess: () => toast.success(`${a.username} can sign in again`) },
                                )
                              }
                            >
                              <Power /> Enable
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">You can&apos;t disable your own account. Ask another admin if needed.</p>

      <AddAdminDialog open={adding} onOpenChange={setAdding} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <RenameDialog key={renaming?.id ?? "none"} admin={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={`Disable ${disabling?.display_name || disabling?.username}?`}
        description="They can't sign in to the admin console until another admin enables them again."
        confirmLabel="Disable admin"
        pending={update.isPending}
        onConfirm={() => {
          if (!disabling) return;
          update.mutate(
            { id: disabling.id, is_active: false },
            {
              onSuccess: () => {
                toast.success("Admin disabled");
                setDisabling(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
