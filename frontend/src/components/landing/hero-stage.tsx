"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The landing hero: a soft perspective grid floor drifting towards the viewer, and the pointer's position
 * published as CSS variables (--mx, --my in -1…1, --pa 0/1) for the phone tilt and a little floor parallax.
 * Only CSS variables change on pointer move (once per frame), so nothing re-renders or re-lays out.
 * Reduced motion, touch screens, a hidden tab and an off-screen hero all leave the scene still.
 */
export function HeroStage({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let px = 0;
    let py = 0;
    let inside = false;
    let onScreen = true;

    const apply = () => {
      frame = 0;
      if (!inside) {
        el.style.setProperty("--mx", "0");
        el.style.setProperty("--my", "0");
        el.style.setProperty("--pa", "0");
        return;
      }
      const r = el.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      el.style.setProperty("--mx", clamp(((px - r.left) / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--my", clamp(((py - r.top) / r.height) * 2 - 1).toFixed(3));
      el.style.setProperty("--pa", "1");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (still.matches || !fine.matches || e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      inside = true;
      schedule();
    };
    const onLeave = () => {
      inside = false;
      schedule();
    };
    const syncPaused = () => el.toggleAttribute("data-paused", document.hidden || !onScreen);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncPaused();
    });

    io.observe(el);
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", syncPaused);
    return () => {
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", syncPaused);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className={cn("landing-hero relative isolate", className)}>
      <div className="landing-scene" aria-hidden>
        <div className="landing-glow" />
        <div className="landing-floor">
          <div className="landing-floor-plane">
            <div className="landing-floor-grid" />
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Wraps the phone mock-up: it leans a few degrees towards the pointer, catches a soft glare, and lifts on hover. */
export function TiltPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-tilt mx-auto w-full max-w-[22rem]">
      <div className="landing-tilt-body">
        {children}
        <div className="landing-glare" aria-hidden />
      </div>
    </div>
  );
}
