"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { CheckResults } from "@/components/admin/common/check-results";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTestWhatsApp } from "@/lib/admin/queries";

/** Send one WhatsApp message right now (bypasses the queue) to check the sender works. */
export function WhatsAppTestForm() {
  const test = useTestWhatsApp();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("Hello from MailSentinel 👋 This is a test message.");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (phone.trim().length < 6 || !text.trim()) return;
        test.mutate({ phone: phone.trim(), text: text.trim() });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="wa-test-phone">Phone number</FieldLabel>
          <Input
            id="wa-test-phone"
            type="tel"
            inputMode="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <FieldDescription>Include the country code. Use your own number.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="wa-test-text">Message</FieldLabel>
          <Textarea id="wa-test-text" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={test.isPending || phone.trim().length < 6 || !text.trim()}>
        {test.isPending ? <Spinner /> : <Send />} Send test message
      </Button>
      {test.data ? <CheckResults results={[test.data]} /> : null}
    </form>
  );
}
