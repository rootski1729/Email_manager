"use client";

import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAdminAuth } from "@/lib/admin/auth-provider";
import { adminApi, unwrap } from "@/lib/admin/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { APP_NAME } from "@/lib/config";

function safeNext(next: string | null): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") && next !== "/admin/login" ? next : "/admin";
}

export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, signIn } = useAdminAuth();
  const next = safeNext(params.get("next"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || pending) return;
    setPending(true);
    setError(null);
    try {
      const tokens = await unwrap(
        adminApi.POST("/api/v1/admin/auth/login", { body: { username: username.trim().toLowerCase(), password } }),
      );
      signIn(tokens);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Wrong username or password.");
      else setError(errorMessage(err));
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="admin-username">Username</FieldLabel>
          <Input
            id="admin-username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-password">Password</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="admin-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={show ? "Hide password" : "Show password"}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
      {error ? (
        <Alert variant="destructive" role="alert">
          <LockKeyhole />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !username.trim() || !password}>
        {pending ? <Spinner /> : null} Sign in
      </Button>
    </form>
  );
}

export function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-linear-to-b from-hero to-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5.5" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{APP_NAME} admin console</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">For the team that runs {APP_NAME}.</p>
        </div>
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-xs">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Looking for your alerts?{" "}
          <Link href="/login" className="font-medium text-brand-ink underline-offset-4 hover:underline">
            Client sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
