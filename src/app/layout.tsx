import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/domain/app-nav";
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
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-100 font-sans">
        <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="flex items-center justify-between py-4">
              <h1 className="text-xl font-semibold text-zinc-900">
                Personal Portfolio Tracker
              </h1>
            </div>
            <Suspense>
              <AppNav />
            </Suspense>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
