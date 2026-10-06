"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTestAlert } from "@/lib/api/assist";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { chatIdToDisplay } from "@/lib/format";

/** Sends a real-looking alert to your WhatsApp so you can see what one looks like. */
export function useSendTestAlert() {
  const test = useTestAlert();
  const router = useRouter();
  function send() {
    test.mutate(undefined, {
      onSuccess: (out) =>
        toast.success("Test alert on its way", { description: `Check WhatsApp on ${chatIdToDisplay(out.chat_id)}.` }),
      onError: (err) => {
        const noDestination = err instanceof ApiError && err.code === "no_destination";
        toast.error("Couldn't send a test alert", {
          description: errorMessage(err),
          action: noDestination
            ? { label: "Choose who gets alerts", onClick: () => router.push("/destinations") }
            : undefined,
        });
      },
    });
  }
  return { send, pending: test.isPending };
}

export function TestAlertButton({
  variant = "outline",
  size = "sm",
  label = "Send me a test alert",
}: {
  variant?: "default" | "outline";
  size?: "sm" | "default";
  label?: string;
}) {
  const { send, pending } = useSendTestAlert();
  return (
    <Button size={size} variant={variant} disabled={pending} onClick={send}>
      {pending ? <Spinner /> : <FlaskConical />} {label}
    </Button>
  );
}
