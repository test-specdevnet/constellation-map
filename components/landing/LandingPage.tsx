import type { CSSProperties } from "react";
import Link from "next/link";
import styles from "./LandingPage.module.css";

const heroStyle = {
  "--hero-bg": "url('/landing/flux-header-bg.png')",
} as CSSProperties;

export function LandingPage() {
  return (
    <main className={styles.landingPage}>
      <section className={styles.hero} style={heroStyle}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1>Welcome to the FluxCloud Flight Sim</h1>

            <p className={styles.heroSubleader}>
              Navigate the cloud, explore deployment regions, and discover user-built DApps!
            </p>

            <Link href="/sim" className={styles.heroButton}>
              Play Now
            </Link>
          </div>

          <div className={styles.heroMedia} aria-label="FluxCloud Flight Sim preview">
            <div className={styles.heroFrame}>
              <img
                src="/landing/flight-sim-screenshot.png"
                alt="FluxCloud Flight Sim gameplay screenshot"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.contentInner}>
          <article className={styles.card}>
            <h2>What is the FluxCloud Flight Sim?</h2>

            <p>
              The FluxCloud Flight Sim is an entirely vibe-coded DApp functioning as an interactive data visualization tool for FluxCloud application data.
            </p>

            <p>
              There are over 5,000 active deployments on FluxCloud, and the Flight Sim maps every single one. Using the FluxAPI, the Flight Sim pulls in publicly available application data, categorizes deployments by app type (infrastructure, AI, node, miscellaneous, etc.), and maps them within the simulator for discovery.
            </p>

            <p>
              The FluxCloud Flight Sim was launched using Deploy with Git, a FluxCloud feature enabling users to deploy apps directly from Git repos without needing to manually tediously configure Dockerfiles.
            </p>
          </article>

          <article className={styles.card}>
            <h2>How do you play?</h2>

            <ol>
              <li>
                Players explore the FluxCloud and discover as many deployments as possible before their fuel gauge runs out.
              </li>
              <li>
                Deployments are represented by floating buoys, and users must click on a deployment buoy to “discover” it.
              </li>
              <li>
                Interacting with deployment buoys reveals an app data widget that displays the app name, service descriptions, and resource consumption, if available.
              </li>
              <li>
                There are fuel tanks and speed boosts scattered throughout the simulator to help players extend their flight time and discover deployments faster.
              </li>
            </ol>
          </article>
        </div>
      </section>
    </main>
  );
}
