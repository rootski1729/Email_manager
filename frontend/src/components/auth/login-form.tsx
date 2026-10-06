"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { ArrowLeft, ArrowRight, MessageCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { api, unwrap } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-provider";
import { TURNSTILE_SITE_KEY } from "@/lib/config";
import { DEFAULT_COUNTRY, toE164 } from "@/lib/countries";
import { useSecondTicker } from "@/lib/hooks/use-now";
import { PhoneInput } from "./phone-input";

const RESEND_COOLDOWN_S = 30;

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, signIn } = useAuth();
  const next = safeNext(params.get("next"));

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const turnstile = useRef<TurnstileInstance>(null);
  const nowS = useSecondTicker(step === "code");
  const cooldown = Math.max(0, resendAt - nowS);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function requestCode(target: string) {
    setError(null);
    setPending(true);
    try {
      await unwrap(
        api.POST("/api/v1/auth/otp/request", {
          body: { phone: target, turnstile_token: captcha ?? undefined },
        }),
      );
      setPhone(target);
      setStep("code");
      setCode("");
      setResendAt(Math.floor(Date.now() / 1000) + RESEND_COOLDOWN_S);
    } catch (err) {
      const e = err as ApiError;
      setError(errorMessage(err));
      if (e instanceof ApiError && e.retryAfter) {
        setResendAt(Math.floor(Date.now() / 1000) + e.retryAfter);
      }
    } finally {
      setPending(false);
      // Turnstile tokens are single-use.
      if (TURNSTILE_SITE_KEY) {
        setCaptcha(null);
        turnstile.current?.reset();
      }
    }
  }

  async function verify(value: string) {
    if (value.length !== 6 || pending) return;
    setError(null);
    setPending(true);
    try {
      const token = await unwrap(api.POST("/api/v1/auth/otp/verify", { body: { phone, code: value } }));
      signIn(token);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      setPending(false);
    }
  }

  if (step === "phone") {
    const e164 = toE164(country, raw);
    const needsCaptcha = Boolean(TURNSTILE_SITE_KEY) && !captcha;
    return (
      <form
        className="space-y-5"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!e164) {
            setError("Enter a valid mobile number, including the country code.");
            return;
          }
          void requestCode(e164);
        }}
      >
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="phone">WhatsApp number</FieldLabel>
          <PhoneInput
            id="phone"
            country={country}
            onCountryChange={setCountry}
            value={raw}
            onChange={(v) => {
              setRaw(v);
              if (error) setError(null);
            }}
            invalid={Boolean(error)}
            disabled={pending}
            autoFocus
          />
          <FieldDescription>
            We&apos;ll send a 6-digit sign-in code to this number on WhatsApp.
          </FieldDescription>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        {TURNSTILE_SITE_KEY ? (
          <Turnstile
            ref={turnstile}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={setCaptcha}
            onExpire={() => setCaptcha(null)}
            onError={() => setCaptcha(null)}
            options={{ size: "flexible", theme: "auto" }}
          />
        ) : null}
        <Button type="submit" size="lg" className="h-10 w-full" disabled={pending || needsCaptcha || !raw.trim()}>
          {pending ? <Spinner /> : <MessageCircle />}
          Send code on WhatsApp
        </Button>
      </form>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        void verify(code);
      }}
    >
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="otp">Enter the code</FieldLabel>
        <FieldDescription>
          Sent to <span className="font-medium text-foreground tabular">{phone}</span> on WhatsApp.
        </FieldDescription>
        <InputOTP
          id="otp"
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v.replace(/\D/g, ""));
            if (error) setError(null);
          }}
          onComplete={(v: string) => void verify(v)}
          autoFocus
          disabled={pending}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="^[0-9]*$"
          containerClassName="justify-center sm:justify-start"
          aria-invalid={Boolean(error) || undefined}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="size-11 text-lg" />
            <InputOTPSlot index={1} className="size-11 text-lg" />
            <InputOTPSlot index={2} className="size-11 text-lg" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="size-11 text-lg" />
            <InputOTPSlot index={4} className="size-11 text-lg" />
            <InputOTPSlot index={5} className="size-11 text-lg" />
          </InputOTPGroup>
        </InputOTP>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <Button type="submit" size="lg" className="h-10 w-full" disabled={pending || code.length !== 6}>
        {pending ? <Spinner /> : <ArrowRight />}
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStep("phone");
            setError(null);
          }}
        >
          <ArrowLeft /> Change number
        </Button>
        {TURNSTILE_SITE_KEY ? (
          <Button type="button" variant="link" size="sm" onClick={() => setStep("phone")} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={cooldown > 0 || pending}
            onClick={() => void requestCode(phone)}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        )}
      </div>
    </form>
  );
}

