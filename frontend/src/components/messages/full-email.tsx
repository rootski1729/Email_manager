"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import {
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Forward,
  RotateCw,
} from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { downloadAttachment } from "@/lib/api/queries";
import type { EmailFile, MessageContent, ThreadMessage } from "@/lib/api/types";
import { humanSize } from "@/lib/compose";
import { cn } from "@/lib/utils";

import { EmailHtmlFrame } from "./email-html-frame";

/*
 * The whole email on the message page: its own formatting when it has HTML (sanitised by the API, shown in a
 * sandboxed frame), otherwise the plain text with links made clickable.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'")\]}>]+$/;

/** Plain text with http(s) URLs turned into safe links. */
function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    // Leave sentence punctuation after a URL outside the link, but keep a ")" that closes one inside it.
    const tail = TRAILING.exec(url)?.[0] ?? "";
    let trimmed = tail;
    if (tail.startsWith(")") && url.slice(0, -tail.length).includes("(")) trimmed = tail.slice(1);
    if (trimmed) url = url.slice(0, -trimmed.length);
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-brand-ink underline decoration-brand-ink/30 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-brand-ink"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={`t${i}`}>{p}</Fragment> : p))}</>;
}

/** Email text at a comfortable reading measure: blank lines become paragraph gaps, other line breaks are kept. */
function EmailText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.trim().split(/\n[ \t]*(?:\n[ \t]*)+/);
  return (
    <div className={cn("max-w-[70ch] space-y-4 text-[0.95rem] leading-relaxed break-words", className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          <Linkified text={p} />
        </p>
      ))}
    </div>
  );
}

/* ---------- attachments ---------- */

function fileKind(file: EmailFile): { icon: typeof File; label: string } {
  const mime = file.mime_type.toLowerCase();
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (mime === "application/pdf" || ext === "pdf") return { icon: FileText, label: "PDF" };
  if (mime.startsWith("image/")) return { icon: FileImage, label: "Image" };
  if (mime.startsWith("video/")) return { icon: FileVideo, label: "Video" };
  if (mime.startsWith("audio/")) return { icon: FileAudio, label: "Audio" };
  if (/sheet|excel|csv/.test(mime) || ["xls", "xlsx", "csv", "ods"].includes(ext))
    return { icon: FileSpreadsheet, label: "Spreadsheet" };
  if (/word|opendocument\.text|rtf/.test(mime) || ["doc", "docx", "odt", "rtf"].includes(ext))
    return { icon: FileText, label: "Document" };
  if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx", "odp"].includes(ext))
    return { icon: FileText, label: "Slides" };
  if (/zip|compressed|tar|rar|7z/.test(mime) || ["zip", "rar", "7z", "gz", "tar"].includes(ext))
    return { icon: FileArchive, label: "Archive" };
  if (mime.startsWith("text/")) return { icon: FileText, label: "Text" };
  return { icon: File, label: ext ? ext.toUpperCase() : "File" };
}

function AttachmentRow({ messageId, file }: { messageId: string; file: EmailFile }) {
  const [pending, setPending] = useState(false);
  const { icon: Icon, label } = fileKind(file);

  async function download() {
    if (pending) return;
    setPending(true);
    try {
      await downloadAttachment(messageId, file);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name || `Attachment ${file.index + 1}`}
        </p>
        <p className="text-xs text-muted-foreground tabular">
          {label} · {humanSize(file.size)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download()}
        disabled={pending}
        aria-label={`Download ${file.name}`}
      >
        {pending ? <Spinner /> : <Download />}
        <span className="hidden sm:inline">Download</span>
      </Button>
    </li>
  );
}

function Attachments({ messageId, files }: { messageId: string; files: EmailFile[] }) {
  return (
    <section aria-label="Attachments" className="mt-7 border-t pt-5">
      <h3 className="text-sm font-medium">
        Attachments <span className="font-normal text-muted-foreground tabular">({files.length})</span>
      </h3>
      <ul className="mt-1 divide-y">
        {files.map((f) => (
          <AttachmentRow key={f.index} messageId={messageId} file={f} />
        ))}
      </ul>
    </section>
  );
}

/* ---------- earlier in the thread ---------- */

const FIRST_FEW = 2;

function EarlierInThread({ thread }: { thread: ThreadMessage[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? thread : thread.slice(0, FIRST_FEW);
  return (
    <Collapsible className="mt-7 border-t pt-4">
      <CollapsibleTrigger className="group/thread -mx-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]/thread:rotate-90"
        />
        Earlier in this thread <span className="font-normal text-muted-foreground tabular">({thread.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 divide-y">
          {shown.map((t, i) => (
            <li key={i} className="py-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{t.sender || "Someone"}</span>
                {t.sent ? <> · {t.sent}</> : null}
              </p>
              <EmailText text={t.text} className="mt-1.5 space-y-3 text-sm leading-6 text-foreground/85" />
            </li>
          ))}
        </ol>
        {!showAll && thread.length > FIRST_FEW ? (
          <Button variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground" onClick={() => setShowAll(true)}>
            Show all {thread.length}
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ---------- the body ---------- */

function Loading() {
  return (
    <div className="max-w-[70ch] space-y-3 pt-1" aria-busy aria-live="polite">
      <span className="sr-only">Opening the full email…</span>
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="h-2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function LoadFailed({
  error,
  onRetry,
  retrying,
  webUrl,
  snippet,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  webUrl?: string | null;
  snippet?: string | null;
}) {
  return (
    <div>
      <div role="alert" className="text-sm">
        <p className="font-medium">Couldn&apos;t open the full email</p>
        <p className="mt-0.5 text-muted-foreground">{errorMessage(error)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? <Spinner /> : <RotateCw />} Retry
          </Button>
          {webUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={webUrl} target="_blank" rel="noopener noreferrer">
                Open in your mailbox <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      {snippet ? (
        <div className="mt-6 border-t pt-5">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <EmailText text={snippet} className="mt-1.5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}

function Content({ messageId, c }: { messageId: string; c: MessageContent }) {
  const isForward = c.kind === "forward";
  const text = c.text.trim();
  return (
    <>
      {c.html ? (
        <EmailHtmlFrame html={c.html} remoteImages={c.remote_images ?? 0} />
      ) : isForward ? (
        <>
          {c.note?.trim() ? <EmailText text={c.note} /> : null}
          <div className={cn(c.note?.trim() && "mt-6 border-t pt-5")}>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Forward className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                Forwarded from <span className="font-medium text-foreground">{c.forwarded_from || "someone"}</span>
              </span>
            </p>
            {c.forwarded_subject ? <p className="mt-1 font-medium text-pretty">{c.forwarded_subject}</p> : null}
            {text ? <EmailText text={text} className="mt-3" /> : null}
          </div>
        </>
      ) : text ? (
        <EmailText text={text} />
      ) : (
        <p className="text-sm text-muted-foreground">This email has no text.</p>
      )}
      {c.attachments.length ? <Attachments messageId={messageId} files={c.attachments} /> : null}
      {c.thread.length ? <EarlierInThread thread={c.thread} /> : null}
    </>
  );
}

/** Body of the message page's email card: loading, the full text, or a calm failure with a preview. */
export function FullEmail({
  messageId,
  content,
  webUrl,
  snippet,
}: {
  messageId: string;
  content: UseQueryResult<MessageContent>;
  webUrl?: string | null;
  snippet?: string | null;
}) {
  if (content.isPending) return <Loading />;
  if (content.isError) {
    return (
      <LoadFailed
        error={content.error}
        onRetry={() => void content.refetch()}
        retrying={content.isFetching}
        webUrl={webUrl}
        snippet={snippet}
      />
    );
  }
  return (
    <div className="animate-rise">
      <Content messageId={messageId} c={content.data} />
    </div>
  );
}
