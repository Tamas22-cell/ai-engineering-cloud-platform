import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Engineering Cloud Platform",
  description: "Professional AI Engineering dashboard — Agents, RAG, MLOps, Cloud Infrastructure",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0B0E13] text-[#E6E8EB] antialiased">
        {children}
      </body>
    </html>
  );
}
