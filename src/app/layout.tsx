import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEMA National EOC",
  description: "National Disaster Situational Awareness & Intelligence Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-eoc-bg text-eoc-text font-sans antialiased">{children}</body>
    </html>
  );
}
