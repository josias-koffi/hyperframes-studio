import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Workspace Markdown (BRIEF.md, SCRIPT.md…) with the studio's typography; frontmatter shown as a table. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  const frontmatter = match
    ? match[1]
        .split("\n")
        .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
    : [];
  const body = match ? source.slice(match[0].length) : source;

  return (
    <div className={cn("space-y-4 text-sm leading-relaxed", className)}>
      {frontmatter.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-lg border bg-muted/40 p-4 text-sm">
          {frontmatter.map(([, key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words">{value.replace(/^["']|["']$/g, "")}</dd>
            </div>
          ))}
        </dl>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h2 className="mt-6 text-xl font-semibold tracking-tight first:mt-0" {...props} />,
          h2: (props) => <h3 className="mt-6 border-b pb-1 text-base font-semibold first:mt-0" {...props} />,
          h3: (props) => <h4 className="mt-4 font-semibold" {...props} />,
          p: (props) => <p className="my-2" {...props} />,
          ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
          a: (props) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
          code: (props) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props} />,
          pre: (props) => <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 [&_code]:bg-transparent [&_code]:p-0" {...props} />,
          blockquote: (props) => <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-muted-foreground" {...props} />,
          table: (props) => (
            <div className="my-3 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-1.5 [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left" {...props} />
            </div>
          ),
          hr: () => <hr className="my-6" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
