import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import { ToastProvider } from "./components/ToastProvider";
import ConditionalAppHeader from "./components/ConditionalAppHeader";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthAwareFooter } from "@/components/AuthAwareFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Doc Platform", template: "%s | Doc Platform" },
  description: "Document management and case intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var t=d.getAttribute('data-theme');if(!t){try{var s=localStorage.getItem('onyx-theme');if(s==='light'||s==='gradient')t=s;}catch(e){}d.setAttribute('data-theme',t||'dark');})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--onyx-bg, #0c0c0d)",
        }}
      >
        {isDev && (
          <div
            style={{
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              padding: "4px 12px",
              textAlign: "center",
            }}
          >
            DEV MODE
          </div>
        )}
        <ThemeProvider>
          <KeyboardShortcuts />
          <ToastProvider>
            <ConditionalAppHeader />
            {children}
          </ToastProvider>
          <AuthAwareFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
