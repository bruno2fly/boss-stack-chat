import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boss",
  description: "Talk to Boss — Bruno's AI co-founder at 2FLY Digital Marketing.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Boss",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
