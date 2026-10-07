import { AppNav } from "@/components/app-nav";
import {
  CinematicHero,
  FeaturePanels,
  FinalCta,
  StoryScenes,
} from "@/components/homepage/homepage-sections";
import { HomeCinematicMotion } from "@/components/homepage/home-cinematic-motion";
import styles from "@/components/homepage/homepage.module.css";

export default function HomePage() {
  return (
    <main className={styles.home} data-home-root dir="rtl">
      <HomeCinematicMotion />
      <AppNav active="home" className={styles.nav} variant="home" />
      <CinematicHero />
      <StoryScenes />
      <FeaturePanels />
      <FinalCta />
    </main>
  );
}
