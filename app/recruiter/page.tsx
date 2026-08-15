import type { Metadata } from "next";
import { profile } from "@/data/profile";
import { RecruiterModeLazy } from "@/components/RecruiterModeLazy";

export const metadata: Metadata = {
  title: "Recruiter Mode",
  description: `The 30-second summary: who ${profile.name} is, what he's targeting, top skills, top projects, and direct contact links.`,
};

export default function RecruiterModePage() {
  return <RecruiterModeLazy />;
}
