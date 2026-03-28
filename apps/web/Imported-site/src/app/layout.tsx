import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Onyx Intel | AI-Powered Medical Records for Personal Injury Law",
  description:
    "Onyx Intel automatically organizes medical records, generates treatment timelines, extracts billing data, and syncs documents into your case management system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-[var(--bg-primary)] text-[var(--text-primary)]`}>
        {children}
      </body>
    </html>
  );
}
