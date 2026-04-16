"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CloudRain, Activity, Brain, TrendingUp,
  Waves, GitCompare, BookOpen, ChevronDown, Droplets,
  FlaskConical, Siren,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: { label: string; href: string; icon: React.ElementType }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Precipitation",
    icon: CloudRain,
    items: [
      { label: "Historical", href: "/precipitation/historical", icon: CloudRain },
      { label: "ML Models", href: "/precipitation/models", icon: Brain },
      { label: "Future Projections", href: "/precipitation/future", icon: TrendingUp },
    ],
  },
  {
    label: "Streamflow",
    icon: Waves,
    items: [
      { label: "Historical", href: "/streamflow/historical", icon: Waves },
      { label: "ML Models", href: "/streamflow/models", icon: Brain },
      { label: "Future Projections", href: "/streamflow/future", icon: TrendingUp },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Precipitation: true,
    Streamflow: true,
  });

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-screen fixed left-0 top-0 z-40">
      <div className="p-4 border-b border-slate-700">
        <Link href="/" className="flex items-center gap-2">
          <Droplets className="h-6 w-6 text-sky-400" />
          <div>
            <h1 className="font-bold text-sm leading-tight">Himayat Sagar</h1>
            <p className="text-[10px] text-slate-400">Hydroclimatic Dashboard</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {/* Overview */}
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
            pathname === "/" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </Link>
        <Link
          href="/forecast"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
            pathname === "/forecast" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          )}
        >
          <Activity className="h-4 w-4" />
          7-Day Forecast
        </Link>

        {/* Nav Groups */}
        {navGroups.map((group) => (
          <div key={group.label} className="mt-1">
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
            >
              <span className="flex items-center gap-2">
                <group.icon className="h-3.5 w-3.5" />
                {group.label}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", expandedGroups[group.label] && "rotate-180")}
              />
            </button>
            {expandedGroups[group.label] && (
              <div className="ml-4">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-sm transition-colors rounded-l-md",
                      pathname === item.href
                        ? "bg-slate-800 text-sky-400 border-r-2 border-sky-400"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Bottom links */}
        <div className="mt-1">
          <Link
            href="/integrated"
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
              pathname === "/integrated" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <GitCompare className="h-4 w-4" />
            Integrated Analysis
          </Link>
          <Link
            href="/methodology"
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
              pathname === "/methodology" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <BookOpen className="h-4 w-4" />
            Methodology
          </Link>
        </div>

        {/* Alerts & Safety */}
        <div className="mt-3 border-t border-slate-700 pt-3">
          <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Alerts &amp; Safety
          </p>
          <Link
            href="/water-quality"
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
              pathname === "/water-quality" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <FlaskConical className="h-4 w-4" />
            Water Quality
          </Link>
          <Link
            href="/flood-alert"
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
              pathname === "/flood-alert" ? "bg-slate-800 text-sky-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Siren className="h-4 w-4" />
            Flood Alert
          </Link>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-700 text-[10px] text-slate-500 text-center">
        Data: Open-Meteo API | Model: EC_Earth3P_HR
      </div>
    </aside>
  );
}
