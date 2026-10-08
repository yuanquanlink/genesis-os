export const sectionKeys = ["learning", "learning-goals", "learning-resources", "today-learning", "knowledge-map", "review-center", "project-challenge", "cognition", "strategy", "missions", "monthly-review", "usage", "knowledge", "memory", "self-input", "digital-life", "growth-graph", "evidence", "timeline", "settings"] as const;

export const learningSectionKeys = ["learning", "learning-goals", "learning-resources", "today-learning", "knowledge-map", "review-center", "project-challenge"] as const;

export type SectionKey = "today" | (typeof sectionKeys)[number];

export function isSectionKey(value: string): value is (typeof sectionKeys)[number] {
  return (sectionKeys as readonly string[]).includes(value);
}

export function isLearningSection(value: string): value is (typeof learningSectionKeys)[number] {
  return (learningSectionKeys as readonly string[]).includes(value);
}
