"use client";

import { useEffect } from "react";

type GsapMatchMedia = {
  add: (
    conditions: Record<string, string>,
    callback: (context: { conditions?: Record<string, boolean> }) => void,
  ) => void;
  revert: () => void;
};

export function HomeCinematicMotion() {
  useEffect(() => {
    let mounted = true;
    let context: { revert: () => void } | undefined;
    let matchMediaContext: GsapMatchMedia | undefined;

    async function runMotion() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (!mounted) return;

      gsap.registerPlugin(ScrollTrigger);

      const root = document.querySelector<HTMLElement>("[data-home-root]");
      if (!root) return;

      context = gsap.context(() => {
        matchMediaContext = gsap.matchMedia();

        matchMediaContext.add(
          {
            desktop: "(min-width: 861px)",
            reduced: "(prefers-reduced-motion: reduce)",
          },
          ({ conditions }) => {
            const isDesktop = Boolean(conditions?.desktop);
            const reducedMotion = Boolean(conditions?.reduced);

            const story = root.querySelector<HTMLElement>("[data-cinematic-story]");
            const pin = root.querySelector<HTMLElement>("[data-cinematic-pin]");
            const copies = gsap.utils.toArray<HTMLElement>("[data-story-copy]", story || root);
            const layers = gsap.utils.toArray<HTMLElement>("[data-story-layer]", story || root);
            const steps = gsap.utils.toArray<HTMLElement>("[data-scene-step]", story || root);

            if (!story || !pin || !copies.length || !layers.length || reducedMotion || !isDesktop) {
              gsap.set([...copies, ...layers], { clearProps: "all" });
              steps.forEach((step) => step.removeAttribute("data-active"));
              story?.removeAttribute("data-active-scene");
              story?.setAttribute("data-motion-mode", reducedMotion ? "reduced" : "stacked");
              return;
            }

            story.setAttribute("data-motion-mode", "pinned");

            const setActiveScene = (index: number) => {
              const activeIndex = Math.max(0, Math.min(index, copies.length - 1));
              story.dataset.activeScene = String(activeIndex);
              steps.forEach((step, stepIndex) => {
                if (stepIndex === activeIndex) {
                  step.setAttribute("data-active", "true");
                } else {
                  step.removeAttribute("data-active");
                }
              });
            };

            setActiveScene(0);

            gsap.set(copies, { autoAlpha: 0, y: 18 });
            gsap.set(copies[0], { autoAlpha: 1, y: 0 });
            gsap.set(layers, { autoAlpha: 0, y: 22 });
            gsap.set(layers[0], { autoAlpha: 1, y: 0 });

            const riskDial = story.querySelector<HTMLElement>("[data-story-layer] [data-risk-dial]");
            const riskNumber = riskDial?.querySelector<HTMLElement>("[data-risk-number]");
            const riskValue = { value: 0 };
            if (riskDial) gsap.set(riskDial, { "--score": "0%" });
            if (riskNumber) riskNumber.textContent = "0";

            const chips = gsap.utils.toArray<HTMLElement>("[data-result-chip]", story);
            const careLine = story.querySelector<HTMLElement>("[data-care-line]");
            const careSteps = gsap.utils.toArray<HTMLElement>("[data-care-step]", story);
            const riskDecision = story.querySelector<HTMLElement>("[data-risk-decision]");
            const reportPaper = story.querySelector<HTMLElement>("[data-report-paper]");
            const paperNote = story.querySelector<HTMLElement>("[data-paper-note]");

            gsap.set(chips, { autoAlpha: 0, y: 12 });
            if (careLine) gsap.set(careLine, { "--line-scale": 0 });
            gsap.set(careSteps, { autoAlpha: 0, y: 12 });
            if (riskDecision) gsap.set(riskDecision, { autoAlpha: 0, y: 12 });
            if (reportPaper) gsap.set(reportPaper, { autoAlpha: 0, y: 24, scale: 0.985, rotate: -0.35 });
            if (paperNote) gsap.set(paperNote, { autoAlpha: 0, y: 12 });

            const timeline = gsap.timeline({
              defaults: { ease: "power2.inOut" },
              scrollTrigger: {
                trigger: story,
                start: "top top",
                end: () => `+=${window.innerHeight * 6.4}`,
                pin,
                pinSpacing: true,
                scrub: 0.8,
                anticipatePin: 0.7,
                invalidateOnRefresh: true,
                onUpdate: (self) => {
                  const labels = ["sceneListen", "sceneUnderstand", "sceneRisk", "sceneFollow", "sceneReport"];
                  const currentTime = self.progress * timeline.duration();
                  const activeIndex = labels.reduce((current, label, index) => {
                    const labelTime = timeline.labels[label] ?? 0;
                    return currentTime >= labelTime - 0.12 ? index : current;
                  }, 0);
                  setActiveScene(activeIndex);
                },
              },
            });

            const transitionScene = (fromIndex: number, toIndex: number, label: string) => {
              timeline
                .to(copies[fromIndex], { autoAlpha: 0, y: -14, duration: 0.78 }, `${label}-=0.18`)
                .fromTo(
                  copies[toIndex],
                  { autoAlpha: 0, y: 18 },
                  { autoAlpha: 1, y: 0, duration: 0.92 },
                  `${label}-=0.04`,
                )
                .to(layers[fromIndex], { autoAlpha: 0, y: -14, duration: 0.9 }, `${label}-=0.24`)
                .fromTo(
                  layers[toIndex],
                  { autoAlpha: 0, y: 20 },
                  { autoAlpha: 1, y: 0, duration: 1 },
                  `${label}-=0.08`,
                );
            };

            timeline
              .addLabel("sceneListen", 0)
              .to({}, { duration: 1.45 })
              .addLabel("sceneUnderstand");

            transitionScene(0, 1, "sceneUnderstand");
            timeline
              .fromTo(chips, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.58, stagger: 0.06 }, "sceneUnderstand+=0.34")
              .to({}, { duration: 1.35 })
              .addLabel("sceneRisk");

            transitionScene(1, 2, "sceneRisk");
            if (riskDial && riskNumber) {
              timeline
                .fromTo(riskDial, { scale: 0.94 }, { scale: 1, duration: 1.02, ease: "power3.out" }, "sceneRisk+=0.04")
                .to(
                  riskValue,
                  {
                    value: 34,
                    duration: 1.08,
                    ease: "power2.out",
                    onUpdate: () => {
                      const rounded = Math.round(riskValue.value);
                      riskNumber.textContent = String(rounded);
                      riskDial.style.setProperty("--score", `${rounded}%`);
                    },
                  },
                  "sceneRisk+=0.22",
                );
            }
            if (riskDecision) {
              timeline.to(riskDecision, { autoAlpha: 1, y: 0, duration: 0.7 }, "sceneRisk+=0.96");
            }
            timeline.to({}, { duration: 1.35 }).addLabel("sceneFollow");

            transitionScene(2, 3, "sceneFollow");
            if (careLine) {
              timeline.to(careLine, { "--line-scale": 1, duration: 0.86, ease: "power2.out" }, "sceneFollow+=0.18");
            }
            timeline.to(careSteps, { autoAlpha: 1, y: 0, duration: 0.62, stagger: 0.14 }, "sceneFollow+=0.32").to({}, { duration: 1.3 }).addLabel("sceneReport");

            transitionScene(3, 4, "sceneReport");
            if (reportPaper) {
              timeline.to(reportPaper, { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 0.92, ease: "power3.out" }, "sceneReport+=0.16");
            }
            if (paperNote) {
              timeline.to(paperNote, { autoAlpha: 1, y: 0, duration: 0.62 }, "sceneReport+=0.58");
            }
            timeline.to({}, { duration: 1.55 });

            requestAnimationFrame(() => ScrollTrigger.refresh());
          },
        );
      }, root);
    }

    void runMotion();

    return () => {
      mounted = false;
      matchMediaContext?.revert();
      context?.revert();
    };
  }, []);

  return null;
}
