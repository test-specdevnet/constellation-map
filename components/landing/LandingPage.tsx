import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { LandingLeaderboard } from "./LandingLeaderboard";
import styles from "./LandingPage.module.css";

const heroStyle = {
  "--hero-bg": "url('/landing/flux-header-bg.png')",
} as CSSProperties;

const features: Array<{
  title: string;
  body: string;
  icon: ReactNode;
}> = [
  {
    title: "Discover DApps",
    body: "Find live deployments across the FluxCloud.",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 5 5" />
      </>
    ),
  },
  {
    title: "Collect fuel + boosts",
    body: "Gather resources and power up your flight.",
    icon: (
      <>
        <path d="M8 3h7v18H8z" />
        <path d="M15 7h3l2 3v8a2 2 0 0 1-2 2h-3" />
        <path d="m11 10 3 3h-2l1 4-4-5h2z" />
      </>
    ),
  },
  {
    title: "Dogfight patrols",
    body: "Outfly green CPU biplanes in stormy cloud lanes.",
    icon: (
      <>
        <path d="M4 13h16" />
        <path d="m7 10-3 3 3 3" />
        <path d="m17 10 3 3-3 3" />
        <path d="M12 5v14" />
      </>
    ),
  },
];

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className={styles.featureIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </span>
  );
}

export function LandingPage() {
  return (
    <main className={styles.landingPage} style={heroStyle}>
      <section className={styles.hero} aria-label="FluxCloud Flight Sim">
        <div className={styles.heroShade} />

        <div className={styles.posterColumn}>
          <div className={styles.brandLockup}>
            <img src="/flux-logo.svg" alt="Flux" />
            <span>Flux</span>
          </div>

          <h1>
            <span>FluxCloud</span>
            <span>Flight Sim</span>
          </h1>

          <p className={styles.heroMetric}>
            Explore <strong>5,000+</strong>
            <span> active deployments</span>
          </p>

          <div className={styles.featureList}>
            {features.map((feature) => (
              <article className={styles.featureItem} key={feature.title}>
                <FeatureIcon>{feature.icon}</FeatureIcon>
                <div>
                  <h2>{feature.title}</h2>
                  <p>{feature.body}</p>
                </div>
              </article>
            ))}
          </div>

          <Link href="/sim" className={styles.heroButton} aria-label="Play the FluxCloud Flight Sim">
            <img src="/flux-logo.svg" alt="" />
            <span>Play the Sim</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        </div>

        <aside className={styles.deploymentCard} aria-label="Featured deployment">
          <div className={styles.cardHeader}>
            <div>
              <span>Deployment</span>
              <strong>Minesweeper</strong>
            </div>
            <span className={styles.closePill}>Close</span>
          </div>
          <div className={styles.pills}>
            <span>unknown</span>
            <span>unknown</span>
            <span>misc</span>
          </div>
          <p>Minesweeper</p>
          <dl className={styles.deploymentGrid}>
            <div>
              <dt>Owner</dt>
              <dd>1966JW...</dd>
            </div>
            <div>
              <dt>Instances</dt>
              <dd>3</dd>
            </div>
            <div>
              <dt>Resource tier</dt>
              <dd>small</dd>
            </div>
            <div>
              <dt>Active nodes</dt>
              <dd>0</dd>
            </div>
          </dl>
        </aside>

        <aside className={styles.overviewCard} aria-label="Region overview">
          <div className={styles.overviewHeader}>
            <strong>Overview</strong>
            <span>50 regions</span>
          </div>
          <div className={styles.miniMap}>
            {Array.from({ length: 34 }, (_, index) => (
              <span
                key={index}
                style={{
                  "--x": `${10 + ((index * 17) % 78)}%`,
                  "--y": `${14 + ((index * 29) % 68)}%`,
                  "--s": `${4 + (index % 4) * 2}px`,
                } as CSSProperties}
              />
            ))}
          </div>
          <div className={styles.legend}>
            <span>Fuel</span>
            <span>Boost</span>
            <span>Cluster</span>
          </div>
          <p>Unknown Sector</p>
        </aside>

        <div className={styles.foundCounter}>
          <span>Deployments found</span>
          <strong>0</strong>
        </div>

        <div className={styles.cloudBadge} aria-hidden="true">
          <img src="/flux-logo.svg" alt="" />
        </div>
      </section>

      <section className={styles.leaderboardSection}>
        <div className={styles.sectionInner}>
          <LandingLeaderboard />
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.sectionInner}>
          <article>
            <span>Flight systems</span>
            <h2>Built for fast, readable cloud exploration.</h2>
            <p>
              Fly in any direction, collect boosts, ride through weather cells, and inspect live
              FluxCloud deployments without losing the scene's smooth feel.
            </p>
          </article>

          <article>
            <span>Combat layer</span>
            <h2>Green patrol biplanes now defend the sky.</h2>
            <p>
              Space fires forward shots, enemy projectiles affect hull health, and defeated CPU
              biplanes add upgrade credits to the run.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
