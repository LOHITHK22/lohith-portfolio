"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Github, Linkedin, FileText, ArrowDown, Mail, Zap, Volume2, VolumeX } from "lucide-react";
import { profile, heroStats, recruiterSummary } from "@/data/profile";
import { track } from "@/lib/analytics";
import { AnimatedCounter } from "./AnimatedCounter";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants } from "@/lib/motion";
import dynamic from "next/dynamic";

const GridBackground = dynamic(() => import("./GridBackground").then((m) => m.GridBackground), {
  ssr: true,
});

export function Hero() {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMuted, setVideoMuted] = useState(true);

  const toggleVideoSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setVideoMuted(video.muted);
  };

  // Bridge for the AI Pitch tour: it dispatches these instead of reaching
  // into this component's refs directly, since the two components don't
  // otherwise share state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlayWithSound = () => {
      video.muted = false;
      setVideoMuted(false);
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    const onEnded = () => {
      window.dispatchEvent(new Event("hero-video-ended"));
    };
    const onPause = () => video.pause();
    const onResume = () => video.play().catch(() => {});
    const onStop = () => {
      video.pause();
      video.muted = true;
      setVideoMuted(true);
      video.currentTime = 0;
    };

    window.addEventListener("play-hero-video-with-sound", onPlayWithSound);
    window.addEventListener("pause-hero-video", onPause);
    window.addEventListener("resume-hero-video", onResume);
    window.addEventListener("stop-hero-video", onStop);
    video.addEventListener("ended", onEnded);

    return () => {
      window.removeEventListener("play-hero-video-with-sound", onPlayWithSound);
      window.removeEventListener("pause-hero-video", onPause);
      window.removeEventListener("resume-hero-video", onResume);
      window.removeEventListener("stop-hero-video", onStop);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16">
      <GridBackground />

      <div className="section-shell relative lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10">
      <div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion)}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-wide text-emerald-300/90 sm:mb-6 sm:px-3.5 sm:text-[11px] sm:tracking-wider"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {profile.careerFairTagline}
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.05)}
          className="text-glow max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl"
        >
          {profile.name}
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.1)}
          className="mt-3 max-w-2xl text-lg font-medium sm:mt-4 sm:text-xl"
        >
          <span className="gradient-text">{profile.headline}</span>
        </motion.p>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.15)}
          className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400 sm:text-base"
        >
          {profile.subIdentity}
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.18)}
          className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2"
        >
          {recruiterSummary.strongestSkills.slice(0, 5).map((skill) => (
            <span key={skill} className="chip-sm">
              {skill}
            </span>
          ))}
        </motion.div>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.2)}
          className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:mt-5 sm:text-base md:text-lg"
        >
          {profile.heroParagraph}
        </motion.p>

        {/* Primary CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.25)}
          className="mt-5 flex flex-wrap items-center gap-3 sm:mt-8"
        >
          <a
            href={profile.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            data-cursor-label="VIEW"
            onClick={() => track("resume_view_click", { source: "hero" })}
          >
            <FileText className="h-4 w-4" />
            View Resume
          </a>
          <Link href="/recruiter" className="btn-secondary">
            <Zap className="h-4 w-4" />
            Recruiter Mode
          </Link>
          <a href="#projects" className="btn-secondary">
            Explore Projects
            <ArrowDown className="h-4 w-4" />
          </a>
        </motion.div>

        {/* Secondary CTAs */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.3)}
          className="mt-3 flex flex-wrap items-center gap-3"
        >
          <a
            href={profile.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost gap-1.5 !px-3"
            data-cursor-label="OPEN"
            onClick={() => track("github_click", { source: "hero" })}
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          <a
            href={profile.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost gap-1.5 !px-3"
            data-cursor-label="OPEN"
            onClick={() => track("linkedin_click", { source: "hero" })}
          >
            <Linkedin className="h-4 w-4" />
            LinkedIn
          </a>
          <a
            href="#contact"
            className="btn-ghost gap-1.5 !px-3"
            onClick={() => track("contact_click", { source: "hero" })}
          >
            <Mail className="h-4 w-4" />
            Contact Me
          </a>
        </motion.div>

        {/* Stat counters */}
        <motion.dl
          initial="hidden"
          animate="visible"
          variants={fadeUpVariants(reducedMotion, 0.35)}
          className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4"
        >
          {heroStats.map((stat) => (
            <div key={stat.id}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-mono text-2xl font-bold text-white sm:text-3xl">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
              </dd>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </motion.dl>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUpVariants(reducedMotion, 0.2)}
        className="relative hidden lg:block"
      >
        {/* Ambient glow behind the video so it reads as part of the same lit
            scene as the rest of the hero, not a pasted-in rectangle. */}
        <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-accent/20 blur-[100px]" />
        <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-accent-cyan/10 blur-[120px]" />

        <div className="group relative mx-auto aspect-square w-full max-w-md">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            aria-hidden="true"
            style={{
              maskImage: "radial-gradient(circle at 50% 42%, black 52%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(circle at 50% 42%, black 52%, transparent 78%)",
            }}
          >
            <source src="/videos/hero.mp4" type="video/mp4" />
          </video>

          <button
            type="button"
            onClick={toggleVideoSound}
            aria-label={videoMuted ? "Unmute intro video" : "Mute intro video"}
            className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-base-950/70 text-white backdrop-blur-sm transition-colors duration-200 hover:bg-base-950/90"
          >
            {videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </motion.div>
      </div>
    </section>
  );
}
