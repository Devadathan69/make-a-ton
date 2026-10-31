import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LoopLedger · Subscription operations", template: "%s · LoopLedger" },
  description: "Make-A-Ton starter for Brightloop's subscription management platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><AppShell>{children}</AppShell></body></html>;
}
