import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoopBack – Remember More. Work Smarter.",
  description:
    "AI-powered productivity workspace combining chat, documents, tasks, goals, memory, and analytics.",
  keywords: ["AI", "productivity", "workspace", "chat", "documents", "tasks"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
