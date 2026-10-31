import type { Metadata } from "next";
import { EventExperience } from "@/components/event/EventExperience";
import { profile } from "@/data/profile";

export const metadata: Metadata = {
  title: "AI Event Mode",
  description: `${profile.name}: a 45-second narrated walkthrough of how PipelineMedic AI routes LLM-proposed repairs through policy, human approval, and an MCP server. Resume, GitHub, and contact one tap away.`,
  alternates: { canonical: "/event" },
};

export default function EventPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const kiosk = searchParams?.kiosk === "true";
  const source = typeof searchParams?.source === "string" ? searchParams.source.slice(0, 32) : undefined;
  return <EventExperience kiosk={kiosk} source={source} />;
}
