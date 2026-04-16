import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/domain/app-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans">
        <ThemeProvider>
          <header className="bg-card border-b border-border sticky top-0 z-10">
            <div className="max-w-[1400px] mx-auto px-6">
              <div className="flex items-center justify-between py-4">
                <h1 className="text-xl font-semibold text-foreground">
                  Personal Portfolio Tracker
                </h1>
                <ThemeToggle />
              </div>
              <Suspense>
                <AppNav />
              </Suspense>
            </div>
          </header>
          <main className="max-w-[1400px] mx-auto px-6 py-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
