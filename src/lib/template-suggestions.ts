import type { Subscription } from "../types/subscription";
import type { QuickTemplate } from "./quick-templates";
import { QUICK_TEMPLATES } from "./quick-templates";

const USAGE_KEY = "bills_template_usage";

export function recordTemplateUse(templateId: string): void {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[templateId] = (map[templateId] ?? 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function scoreTemplate(
  template: QuickTemplate,
  subscriptions: Subscription[],
  usage: Record<string, number>,
): number {
  let score = usage[template.id] ?? 0;

  for (const sub of subscriptions) {
    if (sub.category === template.category) score += 2;
    if (sub.frequency === template.frequency) score += 2;
    if (template.kind === "once" && sub.frequency === "once") score += 1;
    if (template.frequency === "weekly" && sub.frequency === "weekly") score += 3;
  }

  return score;
}

/** Top templates según historial y pagos actuales. */
export function suggestTemplates(
  subscriptions: Subscription[],
  limit = 3,
): QuickTemplate[] {
  let usage: Record<string, number> = {};
  try {
    usage = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}");
  } catch {
    usage = {};
  }

  const ranked = QUICK_TEMPLATES.map((t) => ({
    template: t,
    score: scoreTemplate(t, subscriptions, usage),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    // Sin historial: sugerir los tipos más comunes para egresos típicos
    const defaults = ["sub-monthly-app", "credit-once", "loan-weekly"];
    return QUICK_TEMPLATES.filter((t) => defaults.includes(t.id)).slice(0, limit);
  }

  return ranked.slice(0, limit).map((x) => x.template);
}
