import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import PwaRegister from "@/components/PwaRegister";

export const metadata = {
  applicationName: "LoadWise",
  appleWebApp: { capable: true, title: "LoadWise", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  title: { default: "LoadWise | Academic Load Tracker", template: "%s | LoadWise" },
  description: "Academic workload, early warnings, and study planning for university students.",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3f73" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
