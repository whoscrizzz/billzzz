import type { NavIconName } from "../components/NavIcon";

export type NavPage = "home" | "add" | "calendar" | "settings";

export const NAV_ITEMS: { id: NavPage; label: string; icon: NavIconName }[] = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "add", label: "Registrar", icon: "add" },
  { id: "calendar", label: "Calendario", icon: "calendar" },
  { id: "settings", label: "Ajustes", icon: "settings" },
];
