import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { DesktopWindow } from "@/components/layout/desktop-window";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: "Projets vidéo HyperFrames : brief, storyboard, voix, build et exports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Browser extensions (LanguageTool, ColorZilla) add attributes to html and body before hydration. */}
      <body className="min-h-full bg-background font-sans text-foreground" suppressHydrationWarning>
        <ThemeProvider>
          <DesktopWindow />
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
