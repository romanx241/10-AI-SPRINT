import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HR-ассистент Continental",
  description: "Чат-ассистент для сотрудников Continental по вопросам регламентов и политик компании",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`h-full ${inter.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
