"use client";

import type { QuestView } from "./ProgressProvider";

export function QuestLog({
  quests,
  completedQuests,
}: {
  quests: QuestView[];
  completedQuests: number;
}) {
  return (
    <section className="panel-card">
      <div className="panel-card-header">
        <div>
          <p className="eyebrow">Quest log</p>
          <h2>Explorer badges</h2>
        </div>
        <span>{completedQuests}/{quests.length} cleared</span>
      </div>

      <div className="quest-log">
        {quests.map((quest) => (
          <article
            key={quest.id}
            className={`quest-card ${quest.complete ? "quest-card--complete" : ""}`}
          >
            <div className="quest-card-header">
              <strong>{quest.title}</strong>
              <span>{quest.progressLabel}</span>
            </div>
            <p>{quest.description}</p>
            <p className="quest-reward">{quest.reward}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
