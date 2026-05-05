import type { Metadata } from "next";
import { ConstellationExperience } from "../../components/constellation/ConstellationExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FluxCloud Explore",
  description:
    "Fly a red biplane through FluxCloud deployments, collect fuel and boosts, and explore live network data with this interactive visualization tool.",
};

export default function SimPage() {
  return <ConstellationExperience />;
}
