import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KMCQ GmbH URL Gate Security Checkpoint",
  description: "KMCQ GmbH URL Gate Security Checkpoint",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
