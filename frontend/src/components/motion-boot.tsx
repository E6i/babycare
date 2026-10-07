"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function MotionBoot() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let context: { revert: () => void } | undefined;
    let mounted = true;

    async function runMotion() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (!mounted) return;

      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        const navLinks = gsap.utils.toArray<HTMLElement>(".top-nav a");
        if (navLinks.length) {
          gsap.fromTo(
            navLinks,
            { autoAlpha: 0, y: -10 },
            { autoAlpha: 1, y: 0, duration: 0.52, ease: "power3.out", stagger: 0.035 },
          );
        }

        const introElements = gsap.utils.toArray<HTMLElement>(
          [
            ".family-switcher",
            ".dashboard-intro > *",
            ".care-center-hero > *",
            ".care-command-board",
            ".care-center-tabs button",
            ".report-hero > *",
            ".care-plan-hero > *",
            ".chat-conversations",
            ".chat-panel",
            ".auth-card",
          ].join(","),
        );
        if (introElements.length) {
          gsap.fromTo(
            introElements,
            { autoAlpha: 0, y: 18, filter: "blur(8px)" },
            { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.72, ease: "power3.out", stagger: 0.055 },
          );
        }

        gsap.utils
          .toArray<HTMLElement>(
            [
              ".command-panel",
              ".doctor-report-card",
              ".care-center-list article",
              ".care-plan-profile",
            ].join(","),
          )
          .forEach((element) => {
            gsap.fromTo(
              element,
              { autoAlpha: 0.001, y: 22 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.58,
                ease: "power2.out",
                scrollTrigger: { trigger: element, start: "top 91%", once: true },
              },
            );
          });

        const careIcons = gsap.utils.toArray<HTMLElement>(".care-icon");
        if (careIcons.length) {
          gsap.to(careIcons, {
            y: -4,
            duration: 2.6,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: { each: 0.11, from: "random" },
          });
        }
      });
    }

    void runMotion();

    return () => {
      mounted = false;
      context?.revert();
    };
  }, [pathname]);

  return null;
}
