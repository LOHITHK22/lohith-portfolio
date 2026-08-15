import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { WhyMe } from "@/components/WhyMe";
import { ProjectShowcase } from "@/components/ProjectShowcase";
import { GitHubProjects } from "@/components/GitHubProjects";
import { Skills } from "@/components/Skills";
import { ExperienceTimeline } from "@/components/ExperienceTimeline";
import { EducationCertifications } from "@/components/EducationCertifications";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";
import { CareerFairBanner } from "@/components/CareerFairBanner";
import { PageViewTracker } from "@/components/PageViewTracker";
import { TerminalLazy } from "@/components/TerminalLazy";

export default function Home({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const careerFair = searchParams?.careerfair === "true";

  return (
    <>
      <PageViewTracker careerFair={careerFair} />
      <Navigation />
      <main id="main-content">
        {careerFair && <CareerFairBanner />}
        <Hero />
        <WhyMe />
        <ProjectShowcase />
        <GitHubProjects />
        <Skills />
        <ExperienceTimeline />
        <EducationCertifications />
        <TerminalLazy />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
