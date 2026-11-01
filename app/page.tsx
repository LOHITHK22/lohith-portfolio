import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { FlagshipSystem } from "@/components/FlagshipSystem";
import { TeamSection } from "@/components/TeamSection";
import { ProjectShowcase } from "@/components/ProjectShowcase";
import { GitHubProjects } from "@/components/GitHubProjects";
import { Skills } from "@/components/Skills";
import { ExperienceTimeline } from "@/components/ExperienceTimeline";
import { EducationCertifications } from "@/components/EducationCertifications";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";
import { CareerFairBanner } from "@/components/CareerFairBanner";
import { PageViewTracker } from "@/components/PageViewTracker";
import { AgentTeamLazy } from "@/components/AgentTeamLazy";
import { AILab } from "@/components/AILab";
import { EngineeringPlayground } from "@/components/EngineeringPlayground";
import { ScrollProgressBar } from "@/components/ScrollProgressBar";
import { CommandPaletteLazy } from "@/components/CommandPaletteLazy";
import { PrismWelcome } from "@/components/PrismWelcome";

export default function Home({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const careerFair = searchParams?.careerfair === "true";

  // Flow: hero → flagship system → AI team → lab → playground → other systems → experience → contact.
  return (
    <>
      <ScrollProgressBar />
      <PageViewTracker careerFair={careerFair} />
      <Navigation />
      <main id="main-content">
        {careerFair && <CareerFairBanner />}
        <Hero />
        <FlagshipSystem />
        <TeamSection />
        <AILab />
        <EngineeringPlayground />
        <ProjectShowcase />
        <GitHubProjects />
        <ExperienceTimeline />
        <Skills />
        <EducationCertifications />
        <Contact />
      </main>
      <Footer />
      <AgentTeamLazy />
      <PrismWelcome />
      <CommandPaletteLazy />
    </>
  );
}
