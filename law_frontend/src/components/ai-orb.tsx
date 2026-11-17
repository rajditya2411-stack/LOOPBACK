"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

type AiOrbProps = {
  className?: string;
  label?: string;
};

/** A lightweight depth cue for AI-focused views without a WebGL payload. */
export function AiOrb({ className = "", label = "LoopBack AI is ready" }: AiOrbProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`ai-orb ${className}`} role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <motion.div
        className="ai-orb__halo"
        animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ai-orb__core"
        animate={reduceMotion ? undefined : { y: [0, -7, 0], rotate: [0, 4, 0, -4, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
      </motion.div>
    </div>
  );
}
