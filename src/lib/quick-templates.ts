import type { Frequency } from "../types/subscription";

export type TemplateGroup = "suscripciones" | "creditos" | "otros";

/** Patrones de gasto — no nombres fijos; inspirados en tipos reales de egresos. */
export interface QuickTemplate {
  id: string;
  label: string;
  hint: string;
  group: TemplateGroup;
  kind: "recurring" | "once";
  frequency: Frequency;
  category: string;
  currency: string;
  notify_days_before: number;
  notify_hour: number;
  /** Día de semana 1–7 si frequency === weekly */
  weekday?: number;
  namePlaceholder: string;
  amountPlaceholder: string;
}

export const TEMPLATE_GROUPS: { id: TemplateGroup; label: string }[] = [
  { id: "suscripciones", label: "Suscripciones" },
  { id: "creditos", label: "Préstamos y créditos" },
  { id: "otros", label: "Otros pagos" },
];

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "sub-monthly-app",
    label: "App / membresía mensual",
    hint: "Streaming, delivery+, transporte — cobro cada mes",
    group: "suscripciones",
    kind: "recurring",
    frequency: "monthly",
    category: "Suscripciones",
    currency: "MXN",
    notify_days_before: 3,
    notify_hour: 9,
    namePlaceholder: "Nombre del servicio",
    amountPlaceholder: "49 – 200",
  },
  {
    id: "sub-monthly-cloud",
    label: "Nube / almacenamiento",
    hint: "iCloud, Drive, backup — mensual",
    group: "suscripciones",
    kind: "recurring",
    frequency: "monthly",
    category: "Servicios",
    currency: "MXN",
    notify_days_before: 5,
    notify_hour: 9,
    namePlaceholder: "Servicio en la nube",
    amountPlaceholder: "99 – 250",
  },
  {
    id: "sub-monthly-saas",
    label: "Software / negocio",
    hint: "Office, dominios, herramientas — mensual",
    group: "suscripciones",
    kind: "recurring",
    frequency: "monthly",
    category: "Servicios",
    currency: "MXN",
    notify_days_before: 3,
    notify_hour: 9,
    namePlaceholder: "Software o SaaS",
    amountPlaceholder: "50 – 500",
  },
  {
    id: "sub-yearly",
    label: "Pago anual",
    hint: "Hosting, dominio, seguro — una vez al año (puede ser USD)",
    group: "suscripciones",
    kind: "recurring",
    frequency: "yearly",
    category: "Servicios",
    currency: "MXN",
    notify_days_before: 14,
    notify_hour: 9,
    namePlaceholder: "Servicio anual",
    amountPlaceholder: "10 – 500",
  },
  {
    id: "loan-weekly",
    label: "Abono semanal",
    hint: "Préstamo con pagos cada semana — ej. fintech",
    group: "creditos",
    kind: "recurring",
    frequency: "weekly",
    category: "Préstamos",
    currency: "MXN",
    notify_days_before: 1,
    notify_hour: 9,
    weekday: 5,
    namePlaceholder: "Nombre del préstamo",
    amountPlaceholder: "500 – 2000",
  },
  {
    id: "credit-once",
    label: "Pago de crédito",
    hint: "Abono puntual a tarjeta, préstamo o app de crédito",
    group: "creditos",
    kind: "once",
    frequency: "once",
    category: "Préstamos",
    currency: "MXN",
    notify_days_before: 3,
    notify_hour: 15,
    namePlaceholder: "Crédito o préstamo",
    amountPlaceholder: "1000 – 5000",
  },
  {
    id: "tuition-once",
    label: "Colegiatura / escuela",
    hint: "Pago único por ciclo o inscripción",
    group: "otros",
    kind: "once",
    frequency: "once",
    category: "Educación",
    currency: "MXN",
    notify_days_before: 7,
    notify_hour: 9,
    namePlaceholder: "Escuela o curso",
    amountPlaceholder: "Monto del ciclo",
  },
  {
    id: "personal-once",
    label: "Pago personal",
    hint: "Familia, ayuda, transferencia acordada",
    group: "otros",
    kind: "once",
    frequency: "once",
    category: "Personal",
    currency: "MXN",
    notify_days_before: 3,
    notify_hour: 9,
    namePlaceholder: "A quién o para qué",
    amountPlaceholder: "Monto",
  },
];

export function templatesByGroup(group: TemplateGroup): QuickTemplate[] {
  return QUICK_TEMPLATES.filter((t) => t.group === group);
}
