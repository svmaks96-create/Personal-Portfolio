import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { AppNav } from "@/components/domain/app-nav";
import { PortfolioSelector } from "@/components/domain/portfolio-selector";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getUniquePortfolios } from "@/server/queries/portfolios";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Personal Portfolio Tracker",
  description: "Track investment positions across multiple brokerage accounts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const portfolios = getUniquePortfolios();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans">
        <ThemeProvider>
          <header className="sticky top-0 z-10 border-b border-line-soft bg-background">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-10 py-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12 L6 8 L9 10 L14 4" />
                    <circle cx="14" cy="4" r="1.4" fill="currentColor" stroke="none" />
                    <path d="M2 14 L14 14" opacity="0.45" />
                  </svg>
                </div>
                <span className="text-[15px] font-semibold tracking-tight text-foreground">
                  Personal Portfolio Tracker
                </span>
              </div>
              <Suspense>
                <AppNav />
              </Suspense>
              <div className="flex items-center gap-2">
                <Suspense>
                  <PortfolioSelector portfolios={portfolios} />
                </Suspense>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-10 py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
