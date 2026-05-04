import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BUILD_STAMP } from "../lib/buildStamp";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluxCloud Explore",
  description:
    "Fly a red biplane through FluxCloud deployments, collect fuel and boosts, and explore live network data with this interactive visualization tool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-build={BUILD_STAMP}>
      <body data-build={BUILD_STAMP}>{children}</body>
    </html>
  );
}
