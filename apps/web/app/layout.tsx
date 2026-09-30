import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealTrip — Patient Decision Assistant",
  description: "A grounded, tool-calling triage and provider-matching assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
