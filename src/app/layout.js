import { Bricolage_Grotesque } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";
import PwaRegister from "@/components/PwaRegister";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata = {
  applicationName: "LoadWise",
  appleWebApp: { capable: true, title: "LoadWise", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  title: { default: "LoadWise | Academic Load Tracker", template: "%s | LoadWise" },
  description: "Academic workload, early warnings, and study planning for university students.",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">Skip to content</a>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}