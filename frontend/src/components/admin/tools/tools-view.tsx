"use client";

import { CalendarSearch, FlaskConical, MessageCircle, PlugZap } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateFinder } from "./date-finder";
import { MailboxTester } from "./mailbox-tester";
import { RuleTester } from "./rule-tester";
import { WhatsAppTestForm } from "./whatsapp-test-form";

const TABS = ["rule", "dates", "whatsapp", "mailbox"] as const;
type Tab = (typeof TABS)[number];

export function ToolsView({ tab, ruleId }: { tab?: string; ruleId?: string }) {
  const [active, setActive] = useState<Tab>(TABS.includes(tab as Tab) ? (tab as Tab) : "rule");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Test lab"
        description="Try things safely. Nothing here changes a client's data."
        className="pb-0"
      />
      <Tabs value={active} onValueChange={(v) => setActive(v as Tab)} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="rule">
              <FlaskConical /> Rule tester
            </TabsTrigger>
            <TabsTrigger value="dates">
              <CalendarSearch /> Date finder
            </TabsTrigger>
            <TabsTrigger value="whatsapp">
              <MessageCircle /> WhatsApp test
            </TabsTrigger>
            <TabsTrigger value="mailbox">
              <PlugZap /> Mailbox login
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="rule">
          <RuleTester ruleId={ruleId} />
        </TabsContent>
        <TabsContent value="dates">
          <DateFinder />
        </TabsContent>
        <TabsContent value="whatsapp">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Send a WhatsApp test message</CardTitle>
              <CardDescription>
                Sends right away from the linked phone, skipping the queue. Use it after pairing to confirm everything works.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WhatsAppTestForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="mailbox">
          <MailboxTester />
        </TabsContent>
      </Tabs>
    </div>
  );
}
