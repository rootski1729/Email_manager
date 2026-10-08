import { cn } from "@/lib/utils";

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };

const BULLET = /^\s*[-•]\s+(.*)$/;

/** Plain-text AI answer: line breaks kept, blank lines start a new paragraph and "- " lines become a list. */
export function AnswerText({ text, className }: { text: string; className?: string }) {
  const blocks: Block[] = [];
  let open: Block | null = null;
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    if (!line.trim()) {
      open = null;
    } else if (bullet) {
      if (open?.kind === "ul") open.items.push(bullet[1]);
      else blocks.push((open = { kind: "ul", items: [bullet[1]] }));
    } else if (open?.kind === "p") {
      open.lines.push(line);
    } else {
      blocks.push((open = { kind: "p", lines: [line] }));
    }
  }
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-pretty break-words", className)}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {b.lines.join("\n")}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
