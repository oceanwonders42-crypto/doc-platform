import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthAwareFooter } from "@/components/AuthAwareFooter";
import ConditionalAppHeader from "./components/ConditionalAppHeader";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var t=d.getAttribute('data-theme');if(!t){try{var s=localStorage.getItem('onyx-theme');if(s==='light'||s==='gradient')t=s;}catch(e){}}d.setAttribute('data-theme',t||'dark');})();`,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--onyx-bg)",
        }}
      >
        <ThemeProvider>
          <ConditionalAppHeader />
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {children}
          </div>
          <AuthAwareFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
