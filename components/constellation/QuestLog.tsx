"use client";

import type { QuestView } from "./ProgressProvider";

export function QuestLog({
  quests,
  completedQuests,
}: {
  quests: QuestView[];
  completedQuests: number;
}) {
  const unlockedBadges = quests.filter((quest) => quest.complete);
  const activeQuest = quests.find((quest) => !quest.complete) ?? null;

  return (
    <section className="panel-card">
      <div className="panel-card-header">
        <div>
          <p className="eyebrow">Quest log</p>
          <h2>Explorer badges</h2>
        </div>
        <span>{completedQuests}/{quests.length} cleared</span>
      </div>

      <div className="quest-badge-row">
        {unlockedBadges.length > 0 ? (
          unlockedBadges.map((quest) => (
            <span key={quest.id} className="quest-badge">
              {quest.title}
            </span>
          ))
        ) : (
          <span className="quest-badge quest-badge--empty">No badges unlocked yet</span>
        )}
      </div>

      <p className="panel-copy quest-log-copy">
        {activeQuest
          ? `Next objective: ${activeQuest.title} (${activeQuest.progressLabel})`
          : "Every quest is clear. Keep exploring to improve your weekly route."}
      </p>

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
