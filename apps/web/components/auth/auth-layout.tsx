import { Brand } from "@/components/brand";
import { BRAND } from "@/lib/brand";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-background p-6 md:p-10">
      {/* No header here: in the desktop app, this strip moves the window. */}
      <div aria-hidden data-window-drag className="absolute inset-x-0 top-0 h-12" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[28rem] bg-[radial-gradient(ellipse_at_30%_40%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_60%),radial-gradient(ellipse_at_75%_30%,color-mix(in_oklch,var(--rec)_14%,transparent),transparent_55%)]"
      />
      <div className="flex w-full max-w-sm flex-col gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 [&_[data-slot=card]]:shadow-raised">
        <div className="self-center">
          <Brand href="/login" />
        </div>
        {children}
        <p className="text-center text-sm text-muted-foreground">{BRAND.tagline}</p>
      </div>
    </div>
  );
}
