import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Crypto Trading Partner",
  description: "BTC support/resistance swing-trading bot — backtest, paper, and live on Bybit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-gray-600">
          Educational tool — not financial advice. Trade at your own risk.
        </footer>
      </body>
    </html>
  );
}
