"use client";

import { ImageOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/*
 * The email's own formatting, shown the way a mail client would.
 * The HTML arrives already sanitised by the API; it is still rendered in a sandboxed iframe without scripts and
 * with a strict content security policy, so nothing in an email can run, reach the network (unless the reader
 * shows remote images) or restyle the app. Links open in a new tab.
 */

const FRAME_CSS = `
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #18181f; overflow-wrap: anywhere; word-break: break-word; }
p { margin: 0 0 12px; }
img { max-width: 100%; height: auto; }
table { max-width: 100%; }
a { color: #4b38c9; }
blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #e4e4ec; color: #55556a; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px;
  background: #f4f4f7; padding: 1px 4px; border-radius: 4px; }
pre { white-space: pre-wrap; background: #f4f4f7; padding: 10px 12px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
hr { border: 0; border-top: 1px solid #ebebf0; margin: 16px 0; }
`;

function srcDoc(html: string, showImages: boolean) {
  const images = showImages ? "data: https: http:" : "data:";
  const csp = `default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; font-src data:`;
  const body = showImages ? html.replaceAll("data-ms-src=", "src=") : html;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank"><style>${FRAME_CSS}</style></head><body>${body}</body></html>`
  );
}

export function EmailHtmlFrame({ html, remoteImages }: { html: string; remoteImages: number }) {
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(120);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const doc = useMemo(() => srcDoc(html, showImages), [html, showImages]);

  const measure = useCallback(() => {
    const d = frame.current?.contentDocument;
    if (!d?.documentElement) return;
    setHeight(Math.max(40, Math.ceil(d.documentElement.scrollHeight)));
  }, []);

  const onLoad = useCallback(() => {
    observer.current?.disconnect();
    measure();
    const body = frame.current?.contentDocument?.body;
    if (body && typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(measure);
      observer.current.observe(body);
    }
  }, [measure]);

  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <div>
      {remoteImages > 0 && !showImages ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ImageOff className="size-3.5" aria-hidden />
            Images are hidden to protect your privacy.
          </span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowImages(true)}>
            Show images
          </Button>
        </div>
      ) : null}
      {/* Dark mode: emails are designed for a light background, so they sit on a white sheet (as in Gmail). */}
      <div className="overflow-hidden rounded-lg dark:bg-white dark:px-4 dark:py-3">
        <iframe
          ref={frame}
          title="Email content"
          srcDoc={doc}
          onLoad={onLoad}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="block w-full border-0"
          style={{ height }}
        />
      </div>
    </div>
  );
}
