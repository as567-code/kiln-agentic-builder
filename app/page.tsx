import type { Metadata } from "next";
import { KilnWorkspace } from "./components/KilnWorkspace";

export const metadata: Metadata = {
  title: "Kiln — Verifiable Agentic App Builder",
  description:
    "Turn a product brief into tested, inspectable, and deployable software.",
};

export default function Home() {
  return <KilnWorkspace />;
}
