import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* Markdown renderer (replaces prototype mdLite). Inline + GFM.

   Every block element is styled explicitly rather than left to the browser:
   Tailwind's preflight flattens heading sizes and strips list markers, so an
   unstyled `# Heading` renders identically to body text — which is exactly the
   difference the skill Preview tab exists to show. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={heading(19, "18px 0 10px")}>{children}</h1>,
          h2: ({ children }) => <h2 style={heading(16, "18px 0 8px")}>{children}</h2>,
          h3: ({ children }) => <h3 style={heading(14, "14px 0 6px")}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          ul: ({ children }) => <ul style={list}>{children}</ul>,
          ol: ({ children }) => (
            <ol style={{ ...list, listStyle: "decimal" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: "0 0 4px" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "2px 0 2px 12px",
                borderLeft: "2px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--border)" }} />
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          /* `pre` carries the block frame and `code` the inline chip, so a fenced
             block is not double-boxed: inside a `pre` the chip styles are reset. */
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                margin: "0 0 10px",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                fontSize: "0.88em",
                overflowX: "auto",
                whiteSpace: "pre",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, ...props }) => {
            const fenced = "className" in props && /language-/.test(String(props.className ?? ""));
            if (fenced) return <code className="mono">{children}</code>;
            return (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <table
              style={{
                margin: "0 0 10px",
                borderCollapse: "collapse",
                fontSize: "0.94em",
                width: "100%",
              }}
            >
              {children}
            </table>
          ),
          th: ({ children }) => <th style={{ ...cell, fontWeight: 650 }}>{children}</th>,
          td: ({ children }) => <td style={cell}>{children}</td>,
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function heading(size: number, margin: string): React.CSSProperties {
  return {
    fontSize: size,
    fontWeight: 700,
    lineHeight: 1.3,
    margin,
    color: "var(--text-primary)",
  };
}

const list: React.CSSProperties = {
  margin: "0 0 10px",
  paddingLeft: 20,
  listStyle: "disc",
};

const cell: React.CSSProperties = {
  border: "1px solid var(--border)",
  padding: "5px 9px",
  textAlign: "left",
};
