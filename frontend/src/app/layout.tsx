import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — important email, straight to WhatsApp`, template: `%s · ${APP_NAME}` },
  description: "MailSentinel watches your inboxes and sends the emails that matter straight to your WhatsApp.",
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  // Light is the default theme for everyone, so the browser chrome matches Seashell.
  themeColor: "#f9f5ed",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
