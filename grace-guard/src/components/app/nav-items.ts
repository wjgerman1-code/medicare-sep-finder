import { BookOpen, CalendarPlus, DollarSign, FileText, Filter, LayoutDashboard, Settings, Target } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Executive Overview", icon: LayoutDashboard },
  { href: "/activity", label: "Daily Activity", icon: CalendarPlus },
  { href: "/production", label: "Production", icon: FileText },
  { href: "/funnel", label: "Lead Funnel", icon: Filter },
  { href: "/revenue", label: "Revenue & Profit", icon: DollarSign },
  { href: "/goals", label: "Goals & Forecast", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/metrics", label: "Metric Dictionary", icon: BookOpen },
] as const;
