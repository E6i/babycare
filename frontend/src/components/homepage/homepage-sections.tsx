import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./homepage.module.css";

const storyScenes = [
  {
    id: "listen",
    number: "01",
    title: "اسمعي",
    route: "بكاء -> إنصات",
    copy: "اللحظة الأولى ليست لوحة تحكم. صوت واضح، طفل حاضر، ومساحة هادئة قبل أي قرار.",
    visual: "waveform",
    wordAsset: "/homepage/canva/story/scene-word-listen.svg",
  },
  {
    id: "understand",
    number: "02",
    title: "افهمي",
    route: "إنصات -> فهم",
    copy: "يتحول البكاء من ضجيج مربك إلى إشارات مفهومة تساعدك على المتابعة دون ادعاء تشخيص.",
    visual: "chips",
    wordAsset: "/homepage/canva/story/scene-word-understand.svg",
  },
  {
    id: "risk",
    number: "03",
    title: "اطمئني",
    route: "فهم -> اطمئنان",
    copy: "درجة متابعة واحدة تكسر التوتر: ماذا أفعل الآن، ومتى أطلب رأي الطبيب؟",
    visual: "risk",
    wordAsset: "/homepage/canva/story/scene-word-reassure.svg",
  },
  {
    id: "follow",
    number: "04",
    title: "تابعي",
    route: "اطمئنان -> متابعة",
    copy: "بعد الاطمئنان، تصبح الرعاية خطوات قليلة وواضحة: قياس، رضاعة، نوم، وتذكير.",
    visual: "timeline",
    wordAsset: "/homepage/canva/story/scene-word-follow.svg",
  },
  {
    id: "share",
    number: "05",
    title: "شاركي",
    route: "متابعة -> تقرير للطبيب",
    copy: "وفي النهاية، تتحول التفاصيل إلى ملخص مرتب يساعد الطبيب على فهم القصة بسرعة.",
    visual: "report",
    wordAsset: "/homepage/canva/story/scene-word-share.svg",
  },
];

const resultChips = ["مغص / ألم بطني — 82%", "جوع — 41%", "انزعاج — 36%"];

const timelineSteps = ["قياس الحرارة", "متابعة الرضاعة", "ملاحظة النوم", "تذكير بعد ساعتين"];

const proofPanels = [
  {
    title: "من الإشارة إلى معنى",
    copy: "مؤشرات البكاء تظهر بلغة هادئة تساعدك على الفهم والمتابعة بدل التخمين.",
    label: "تحليل البكاء",
  },
  {
    title: "من القلق إلى خطوة",
    copy: "درجة المتابعة لا ترفع التوتر. هي تجعل الخطوة التالية أوضح وأسهل.",
    label: "تقييم الخطورة",
  },
  {
    title: "من التفاصيل إلى ملخص",
    copy: "التقرير يرتب القصة للطبيب دون أن يحل محل الاستشارة الطبية.",
    label: "تقرير للطبيب",
  },
];

function ActionLink({ children, href, variant = "secondary" }: { children: ReactNode; href: string; variant?: "primary" | "secondary" }) {
  return (
    <Link className={`${styles.actionLink} ${variant === "primary" ? styles.actionPrimary : styles.actionSecondary}`} href={href} prefetch={false}>
      {children}
    </Link>
  );
}

function BabySignal({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.babySignal} ${compact ? styles.babySignalCompact : ""}`}>
      <span className={styles.avatarOrb}>
        <Image alt="" aria-hidden="true" height={76} src="/care-icons/baby.png" width={76} />
      </span>
      <div>
        <span>ليان</span>
        <strong>4 شهور</strong>
        <small>ملف الطفل والسياق محفوظان مع الإشارة</small>
      </div>
    </div>
  );
}

function RiskDial({ score = 34 }: { score?: number }) {
  return (
    <div
      className={styles.riskDial}
      data-risk-dial
      style={
        {
          "--score": `${score}%`,
        } as CSSProperties
      }
      aria-label={`درجة المتابعة ${score} من 100`}
    >
      <span>مراقبة قريبة</span>
      <strong data-risk-number>{score}</strong>
      <small>من 100</small>
    </div>
  );
}

function HeroStage() {
  return (
    <div className={styles.heroStage} data-hero-stage aria-label="معاينة منتج SuperMamy">
      <Image
        alt=""
        aria-hidden="true"
        className={`${styles.heroFilmAsset} ${styles.heroFilmAssetDesktop}`}
        data-hero-visual
        height={1100}
        priority
        src="/homepage/canva/hero-film-frame.svg"
        width={1600}
      />
      <Image
        alt=""
        aria-hidden="true"
        className={`${styles.heroFilmAsset} ${styles.heroFilmAssetMobile}`}
        data-hero-visual
        height={1200}
        priority
        src="/homepage/canva/hero-film-frame-mobile.svg"
        width={900}
      />
    </div>
  );
}

function StoryLayer({ visual }: { visual: string }) {
  if (visual === "waveform") {
    return (
      <div className={styles.layerListen}>
        <Image
          alt=""
          aria-hidden="true"
          className={styles.storyAssetImage}
          data-listen-wave
          height={900}
          loading="eager"
          src="/homepage/canva/story/story-listen-wave.svg"
          width={1400}
        />
        <BabySignal />
      </div>
    );
  }

  if (visual === "chips") {
    return (
      <div className={styles.layerUnderstand}>
        <Image alt="" aria-hidden="true" className={styles.storyAssetImage} height={900} loading="eager" src="/homepage/canva/story/story-understand-signals.svg" width={1400} />
        <div className={styles.resultChips} aria-label="مؤشرات احتمالية">
          {resultChips.map((chip) => (
            <span data-result-chip key={chip}>
              {chip}
            </span>
          ))}
        </div>
        <p>هذه مؤشرات للفهم والمتابعة وليست تشخيصًا طبيًا.</p>
      </div>
    );
  }

  if (visual === "risk") {
    return (
      <div className={styles.layerRisk}>
        <RiskDial score={34} />
        <div className={styles.riskDecision} data-risk-decision>
          <span>الخطوة التالية</span>
          <strong>قياس الحرارة خلال ساعتين</strong>
          <p>قرار واضح وهادئ لمتابعة الحالة دون تهويل.</p>
        </div>
        <p className={styles.urgentNote}>عند صعوبة التنفس، خمول شديد، حرارة مرتفعة، أو قيء مستمر، تواصلي مع الطبيب أو الطوارئ فورًا.</p>
      </div>
    );
  }

  if (visual === "timeline") {
    return (
      <div className={styles.layerTimeline}>
        <Image alt="" aria-hidden="true" className={styles.timelineAssetImage} height={900} loading="eager" src="/homepage/canva/story/story-care-timeline.svg" width={900} />
        <ol className={styles.careLine} data-care-line aria-label="خطة متابعة الرعاية">
          {timelineSteps.map((step, index) => (
            <li data-care-step key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className={styles.layerReport}>
      <div data-report-paper className={styles.reportAssetWrap}>
        <Image alt="معاينة ملخص متابعة منظم للطبيب" className={styles.reportAssetImage} height={1200} loading="eager" src="/homepage/canva/story/story-doctor-report.svg" width={1000} />
      </div>
      <div className={styles.paperNote} data-paper-note>
        <span>جاهز للمشاركة</span>
        <strong>المعلومات مرتبة للطبيب</strong>
      </div>
    </div>
  );
}

export function CinematicHero() {
  return (
    <section className={styles.hero} data-home-hero aria-labelledby="home-hero-title">
      <div className={styles.heroCopy}>
        <h1 id="home-hero-title" data-hero-title>
          من أول بكاء... لقرار أوضح
        </h1>
        <p data-hero-line>
          SuperMamy يساعدك على فهم الإشارات، متابعة الحالة، وتجهيز ملخص واضح للطبيب.
        </p>
        <div className={styles.heroActions} data-hero-actions aria-label="إجراءات البداية">
          <ActionLink href="/register" variant="primary">
            ابدئي الآن
          </ActionLink>
          <ActionLink href="/dashboard">فتح الداشبورد</ActionLink>
        </div>
        <p className={styles.safetyNote}>
          ملاحظة مهمة: عند صعوبة التنفس، خمول شديد، حرارة مرتفعة، أو قيء مستمر، تواصلي مع الطبيب أو الطوارئ فورًا.
        </p>
      </div>
      <HeroStage />
    </section>
  );
}

export function StoryScenes() {
  return (
    <section className={styles.storyScroll} data-cinematic-story data-motion-mode="stacked" id="how-it-works" aria-labelledby="story-title">
      <div className={styles.storyPin} data-cinematic-pin>
        <div className={styles.storyCopy}>
          <div className={styles.sceneIndex} aria-hidden="true">
            {storyScenes.map((scene, index) => (
              <span data-scene-step data-scene-index={index} key={scene.id}>
                {scene.number}
              </span>
            ))}
          </div>
          <div className={styles.copyLayers}>
            {storyScenes.map((scene, index) => (
              <article className={styles.copyLayer} data-story-copy data-scene-index={index} key={scene.id}>
                <small>{scene.route}</small>
                <h2 id={index === 0 ? "story-title" : undefined}>{scene.title}</h2>
                <p>{scene.copy}</p>
              </article>
            ))}
          </div>
          <p className={styles.storyNote}>يساعدك SuperMamy على الفهم والتنظيم والمتابعة. عند ظهور أعراض عاجلة، تواصلي مع الطبيب.</p>
        </div>

        <div className={styles.storyStage} data-cinematic-stage aria-label="عرض منتج متغير حسب التمرير">
          <div className={styles.ambientRing} aria-hidden="true" />
          {storyScenes.map((scene, index) => (
            <div className={styles.stageLayer} data-story-layer data-scene-index={index} key={scene.id}>
              <Image alt="" aria-hidden="true" className={styles.sceneWordAsset} height={700} loading="eager" src={scene.wordAsset} width={1600} />
              <StoryLayer visual={scene.visual} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.mobileScenes} aria-label="مشاهد القصة">
        {storyScenes.map((scene) => (
          <article className={styles.mobileScene} key={scene.id}>
            <span>{scene.number}</span>
            <h2>{scene.title}</h2>
            <p>{scene.copy}</p>
            <StoryLayer visual={scene.visual} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function FeaturePanels() {
  return (
    <section className={styles.proofSection} id="features" aria-labelledby="proof-title">
      <div className={styles.proofIntro}>
        <h2 id="proof-title">رعاية أهدأ، معلومات أوضح</h2>
        <p>ثلاث طبقات بسيطة تبني الثقة: فهم الإشارة، متابعة الحالة، وتجهيز ملخص للطبيب.</p>
      </div>
      <div className={styles.proofPanels}>
        {proofPanels.map((panel) => (
          <article className={styles.proofPanel} key={panel.title}>
            <span>{panel.label}</span>
            <h3>{panel.title}</h3>
            <p>{panel.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={styles.finalCta} aria-labelledby="final-cta-title">
      <div>
        <h2 id="final-cta-title">جاهزة لقرار أوضح؟</h2>
        <p>ابدئي من الإشارة الأولى، ثم تابعي الرعاية بخطوات هادئة ومعلومات مرتبة.</p>
      </div>
      <div className={styles.heroActions}>
        <ActionLink href="/register" variant="primary">
          ابدئي الآن
        </ActionLink>
        <ActionLink href="/dashboard">فتح الداشبورد</ActionLink>
      </div>
    </section>
  );
}
