import type { Metadata } from "next";
import { LandingPage } from "../components/landing/LandingPage";

export const metadata: Metadata = {
  title: "FluxCloud Flight Sim",
  description:
    "Navigate the cloud, explore deployment regions, and discover user-built DApps!",
};

export default function Page() {
  return <LandingPage />;
}
