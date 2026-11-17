"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface RichMessageProps {
  content: string;
  isStreaming?: boolean;
}

function InlineText({ children }: { children: string }) {
  const parts = children.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  })}</>;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be unavailable
    }
  };

  return <div className="neo-code-block">
    <div className="neo-code-toolbar"><span>{language || "text"}</span><button type="button" onClick={() => void copy()} aria-label="Copy legal clause">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button></div>
    <pre><code>{code}</code></pre>
  </div>;
}

function TextBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (!line.trim()) { lineIndex += 1; continue; }
    if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const Heading = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push(<Heading key={lineIndex}><InlineText>{line.slice(level + 1)}</InlineText></Heading>);
      lineIndex += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={lineIndex}><InlineText>{line.slice(2)}</InlineText></blockquote>);
      lineIndex += 1;
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      const start = lineIndex;
      while (lineIndex < lines.length && /^[-*] /.test(lines[lineIndex])) items.push(lines[lineIndex++].slice(2));
      blocks.push(<ul key={start}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText>{item}</InlineText></li>)}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    const start = lineIndex;
    while (lineIndex < lines.length && lines[lineIndex].trim() && !/^(#{1,3} |>|[-*] )/.test(lines[lineIndex])) paragraph.push(lines[lineIndex++]);
    blocks.push(<p key={start}><InlineText>{paragraph.join("\n")}</InlineText></p>);
  }
  return <>{blocks}</>;
}

export function RichMessage({ content, isStreaming = false }: RichMessageProps) {
  const parts = content.split(/```([^\n]*)\n?([\s\S]*?)```/g);
  return <div className="neo-rich-message">
    {parts.map((part, index) => index % 3 === 1 ? <CodeBlock key={index} language={part.trim()} code={parts[index + 1] ?? ""} /> : index % 3 === 2 ? null : <TextBlock key={index} content={part} />)}
    {isStreaming && <span className="neo-stream-cursor" aria-label="Generating legal synthesis" />}
  </div>;
}
