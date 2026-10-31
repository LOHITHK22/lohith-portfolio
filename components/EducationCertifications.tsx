"use client";

import { motion } from "framer-motion";
import { GraduationCap, Award } from "lucide-react";
import { education, certifications } from "@/data/education";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fadeUpVariants, staggerContainer } from "@/lib/motion";

export function EducationCertifications() {
  const reducedMotion = useReducedMotion();

  return (
    <section aria-labelledby="education-heading" className="section-shell py-16 sm:py-24">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUpVariants(reducedMotion)}
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-teal">Background</p>
        <h2 id="education-heading" className="mt-3 font-hero text-3xl font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl">
          Education &amp; certifications
        </h2>
      </motion.div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer(reducedMotion)}
          className="flex flex-col gap-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            <GraduationCap className="h-4 w-4 text-accent-cyan" />
            Education
          </h3>
          {education.map((edu) => (
            <motion.div
              key={edu.id}
              variants={fadeUpVariants(reducedMotion)}
              className="glass-panel rounded-2xl p-5 transition-colors duration-300 hover:border-white/20"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h4 className="text-base font-semibold text-white">{edu.institution}</h4>
                <span className="font-mono text-xs text-slate-500">{edu.period}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-300">{edu.degree}</p>
              {edu.detail && <p className="mt-0.5 text-xs text-slate-500">{edu.detail}</p>}
              <p className="mt-2 text-xs text-slate-500">{edu.location}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer(reducedMotion)}
          className="flex flex-col gap-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            <Award className="h-4 w-4 text-accent-cyan" />
            Certifications
          </h3>
          {certifications.map((cert) => (
            <motion.div
              key={cert.id}
              variants={fadeUpVariants(reducedMotion)}
              className="glass-panel flex items-center gap-3 rounded-2xl p-5 transition-colors duration-300 hover:border-white/20"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-accent-amber">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{cert.name}</p>
                <p className="text-xs text-slate-500">{cert.issuer}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
