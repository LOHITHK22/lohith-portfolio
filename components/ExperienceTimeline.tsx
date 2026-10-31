"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MapPin, Briefcase } from "lucide-react";
import { experience } from "@/data/experience";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

export function ExperienceTimeline() {
  const reducedMotion = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(experience[0]?.id ?? null);

  return (
    <section id="experience" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-cyan">Experience</p>
        <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Where I&apos;ve shipped</h2>
      </motion.div>

      <motion.ol
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer(reducedMotion)}
        className="mt-10 flex flex-col gap-0"
      >
        {experience.map((role, idx) => {
          const isOpen = openId === role.id;
          const panelId = `experience-panel-${role.id}`;
          const isLast = idx === experience.length - 1;

          return (
            <motion.li key={role.id} variants={fadeUpVariants(reducedMotion)} className="relative flex gap-4 pb-8">
              {/* connector */}
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1.5 flex h-3 w-3 shrink-0 rounded-full border-2 ${
                    role.current ? "border-accent-cyan bg-accent-cyan" : "border-accent-cyan/60 bg-base-950"
                  }`}
                />
                {!isLast && <span className="w-px flex-1 bg-white/10" />}
              </div>

              <div className="glass-panel min-w-0 flex-1 rounded-2xl p-5 transition-colors duration-300 hover:border-white/20 sm:p-6">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : role.id)}
                  className="flex w-full flex-col items-start gap-2 text-left sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-white sm:text-lg">{role.role}</h3>
                      {role.current && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-300">
                        <Briefcase className="h-3.5 w-3.5" />
                        {role.company}
                      </span>
                      {role.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {role.location}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{role.summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-start">
                    <span className="whitespace-nowrap font-mono text-xs text-slate-500">{role.period}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-accent-cyan" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                        {role.bullets.map((bullet, i) => (
                          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-cyan" />
                            {bullet}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {role.tech.map((t) => (
                          <span key={t} className="chip !text-[11px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.li>
          );
        })}
      </motion.ol>
    </section>
  );
}
