import { BookOpen, CalendarPlus, DollarSign, FileText, Filter, LayoutDashboard, Settings, Target } from "lucide-react";

/** Sidebar entries; `subtitle` is shown under the section title in the top bar. */
export const NAV_ITEMS = [
  { href: "/", label: "Executive Overview", subtitle: "Campaign progress at a glance", icon: LayoutDashboard },
  { href: "/activity", label: "Daily Activity", subtitle: "Log & correct daily production", icon: CalendarPlus },
  { href: "/production", label: "Production", subtitle: "Applications by product & status", icon: FileText },
  { href: "/funnel", label: "Lead Funnel", subtitle: "Lead source performance", icon: Filter },
  { href: "/revenue", label: "Revenue & Profit", subtitle: "Expected vs received revenue", icon: DollarSign },
  { href: "/goals", label: "Goals & Forecast", subtitle: "Pacing, targets & scenarios", icon: Target },
  { href: "/settings", label: "Settings", subtitle: "Campaigns, products & data", icon: Settings },
  { href: "/metrics", label: "Metric Dictionary", subtitle: "How every number is calculated", icon: BookOpen },
] as const;

export function navItemFor(pathname: string) {
  return NAV_ITEMS.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) ?? NAV_ITEMS[0];
}
