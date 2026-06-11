import type { Metadata } from "next";
import { Geist, Geist_Mono, Averia_Serif_Libre } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const averiaSerifLibre = Averia_Serif_Libre({
  variable: "--font-averia-serif-libre",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alpine Shell",
  description: "Remove the Slop!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${averiaSerifLibre.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#050a1a] text-white">{children}</body>
    </html>
  );
}
