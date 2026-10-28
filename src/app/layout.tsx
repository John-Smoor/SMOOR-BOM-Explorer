import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/AppContext";
import { Shell } from "@/components/Shell";
import { appData } from "@/lib/server/data";
import { editor } from "@/lib/server/auth";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "SMOOR BOM Explorer", template: "%s · SMOOR BOM Explorer" },
  description: "FG–PM bill of materials with live ERP stock for the SMOOR packaging team.",
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/favicon-64.png", type: "image/png", sizes: "64x64" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#761214", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [data, user] = [await appData(), await editor()];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {!data.hasDraft && !data.master.length ? (
          <div className="setup">
            <Logo />
            <h1>No BOM master found</h1>
            <p>Run <code>python setup_master.py &lt;your sheet.csv|xlsx&gt;</code> once to import it, or copy <code>BOM_Master.xlsx</code> into the data folder, then reload this page.</p>
          </div>
        ) : (
          <AppProvider {...data} user={user}>
            <Shell>{children}</Shell>
          </AppProvider>
        )}
      </body>
    </html>
  );
}
