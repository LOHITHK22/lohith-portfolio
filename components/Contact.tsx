"use client";

import { motion } from "framer-motion";
import { Mail, Github, Linkedin, FileText, MapPin, Contact2 } from "lucide-react";
import { profile } from "@/data/profile";
import { track } from "@/lib/analytics";
import { downloadVCard } from "@/lib/vcard";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

export function Contact() {
  const reducedMotion = useReducedMotion();

  const handleVCard = () => {
    downloadVCard();
    track("vcard_download");
  };

  const contactCards = [
    {
      id: "email",
      icon: Mail,
      label: "Email",
      value: profile.email,
      href: `mailto:${profile.email}`,
      onClick: () => track("contact_click", { channel: "email" }),
    },
    {
      id: "linkedin",
      icon: Linkedin,
      label: "LinkedIn",
      value: profile.linkedinLabel,
      href: profile.linkedinUrl,
      external: true,
      onClick: () => track("linkedin_click", { source: "contact" }),
    },
    {
      id: "github",
      icon: Github,
      label: "GitHub",
      value: profile.githubLabel,
      href: profile.githubUrl,
      external: true,
      onClick: () => track("github_click", { source: "contact" }),
    },
    {
      id: "resume",
      icon: FileText,
      label: "Resume",
      value: profile.resumeFileName,
      href: profile.resumeUrl,
      external: true,
      onClick: () => track("resume_view_click", { source: "contact" }),
    },
  ];

  return (
    <section id="contact" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
        className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-10"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/15 blur-[100px]" />

        <div className="relative">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">06 · Contact</p>
          <h2 className="max-w-xl mt-4 font-hero text-4xl font-black leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
            {profile.contactCtaLine}
          </h2>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
            <MapPin className="h-4 w-4" />
            {profile.location}, {profile.locationNote}
          </p>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer(reducedMotion)}
            className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {contactCards.map((card) => (
              <motion.a
                key={card.id}
                variants={fadeUpVariants(reducedMotion)}
                href={card.href}
                target={card.external ? "_blank" : undefined}
                rel={card.external ? "noopener noreferrer" : undefined}
                onClick={card.onClick}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent-cyan">
                  <card.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">{card.label}</span>
                  <span className="block truncate text-sm font-medium text-white">{card.value}</span>
                </span>
              </motion.a>
            ))}
          </motion.div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={handleVCard} className="btn-primary">
              <Contact2 className="h-4 w-4" />
              Save Contact
            </button>
            <a
              href={profile.resumeUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              onClick={() => track("resume_download_click", { source: "contact" })}
            >
              <FileText className="h-4 w-4" />
              Download Resume
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
