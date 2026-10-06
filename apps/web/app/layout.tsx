import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HyperFrames Studio",
  description: "Projets vidéo, assets, templates et publication",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Browser extensions (LanguageTool, ColorZilla) add attributes to html and body before hydration. */}
      <body className="flex min-h-full flex-col bg-background text-foreground" suppressHydrationWarning>
        <header className="border-b">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="font-semibold">
              HyperFrames Studio
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Projets
            </Link>
            <Link href="/templates" className="text-sm text-muted-foreground hover:text-foreground">
              Templates
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
