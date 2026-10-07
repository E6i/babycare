import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from "next/font/google";
import { MotionBoot } from "@/components/motion-boot";
import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-arabic",
});

const notoKufiArabic = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-noto-kufi-arabic",
});

export const metadata: Metadata = {
  title: "SuperMamy",
  description: "Arabic-first smart child care assistant",
  metadataBase: new URL("https://babycare.rent-touch.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" suppressHydrationWarning>
      <body className={`${ibmPlexArabic.className} ${ibmPlexArabic.variable} ${notoKufiArabic.variable}`} suppressHydrationWarning>
        <MotionBoot />
        {children}
      </body>
    </html>
  );
}
