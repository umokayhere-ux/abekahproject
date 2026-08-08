import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/ui/Toast";
import { env } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: "RentFinder — Rooms, apartments and houses for rent in Ghana",
    template: "%s | RentFinder",
  },
  description:
    "Find verified rooms, apartments, houses, and studios for rent across Accra, Kumasi, Takoradi, Tema, and the rest of Ghana. Book and pay securely in Ghana cedis.",
  keywords: [
    "rent in Ghana",
    "apartments Accra",
    "houses for rent Kumasi",
    "single room Ghana",
    "RentFinder",
  ],
  openGraph: {
    type: "website",
    siteName: "RentFinder",
    locale: "en_GH",
    title: "RentFinder — Rentals across Ghana",
    description:
      "Discover verified rentals across Ghana, book a viewing, and pay your rent securely in Ghana cedis.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GH" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        {/* First tab stop: lets keyboard users skip the navigation. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
