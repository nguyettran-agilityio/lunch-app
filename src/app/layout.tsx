import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

// The prototype keeps its fake data in the browser (localStorage), so pages render only on the
// client and the server shell has nothing to validate for instant navigation.
export const instant = false;

export const metadata: Metadata = {
  title: "Cơm Lá — prototype",
  description: "Clickable prototype of the office lunch ordering app, with fake data.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f6b3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnam.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
