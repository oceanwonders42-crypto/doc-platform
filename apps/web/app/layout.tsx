import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthAwareFooter } from "@/components/AuthAwareFooter";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/_next/static/css/app/layout.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var t=d.getAttribute('data-theme');if(!t){try{var s=localStorage.getItem('onyx-theme');if(s==='light'||s==='gradient')t=s;}catch(e){}d.setAttribute('data-theme',t||'dark');}})();`,
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
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {children}
          </div>
        </ThemeProvider>
        <AuthAwareFooter />
      </body>
    </html>
  );
}
