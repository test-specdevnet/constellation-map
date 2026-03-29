import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BUILD_STAMP } from "../lib/buildStamp";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluxCloud Explore",
  description:
    "Literally fly through the FluxCloud and explore network deployments, unlocking plane skins as you discover new datapoints with this interactive data visualization tool.",
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
