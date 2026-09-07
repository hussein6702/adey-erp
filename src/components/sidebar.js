"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LogOut,
  Sun,
  Moon,
  ChevronDown,
  ClipboardList,
  Package,
  ShoppingCart,
  Truck,
  PackageOpen,
  List,
  BookOpen,
  Box,
  NotebookText,
  FileText,
  ArrowLeftRight,
  Users,
  CheckSquare,
  ShieldCheck,
  Archive,
  Store,
  X,
  LayoutDashboard,
  BarChart2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { NAV_SECTIONS, DEPARTMENTS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  "inventory-store-stock": Package,
  "inventory-packaging": PackageOpen,
  "inventory-suppliers": Truck,
  "forms-grns": ClipboardList,
  "forms-delivery-note": FileText,
  "forms-purchase-requests": ShoppingCart,
  "forms-daily-production-log": FileText,
  "forms-production-sheet": FileText,
  "forms-stock-transfer-sheet": ArrowLeftRight,
  "products-list": List,
  "products-recipes": BookOpen,
  "products-molds": Box,
  "kitchen-inventory": NotebookText,
  "shop-inventory": Store,
  "hr-staff": Users,
  "hr-checklists": CheckSquare,
  "settings-access-control": ShieldCheck,
  "settings-archive": Archive,
  "analytics": BarChart2,
};

function Tooltip({ label, children }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {label}
      </span>
    </span>
  );
}

export default function Sidebar({ onClose }) {
  const { theme, toggleTheme } = useTheme();
  const { user, access, logout, isRoot } = useAuth();
  const [open, setOpen] = useState(() => NAV_SECTIONS.map(() => true));

  const toggle = (idx) =>
    setOpen((prev) => prev.map((v, i) => (i === idx ? !v : v)));

  const canSee = (key) => {
    if (key === "hr-checklists") return isRoot; // checklist screen is root-only
    return isRoot || access[key] !== false;
  };

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((l) => canSee(l.key)),
  })).filter((s) => s.links.length > 0);

  const deptLabel = DEPARTMENTS.find((d) => d.key === user?.department)?.label || user?.department;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-x-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 lg:hidden dark:border-zinc-800">
        <Link href="/dashboard" className="text-base font-semibold text-zinc-900 dark:text-white">
          ChocERP
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        {visibleSections.map((section, idx) => {
          const isOpen = open[idx];
          return (
            <div key={section.group}>
              <Tooltip label={section.group}>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium uppercase tracking-wide text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white"
                >
                  {section.group}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-zinc-500 transition-transform dark:text-zinc-400",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
              </Tooltip>

              {isOpen && (
                <div className="mt-0.5 flex flex-col space-y-0.5 border-l border-zinc-200 py-1 pl-3 ml-2 dark:border-zinc-800">
                  {section.links.map((link) => {
                    const LinkIcon = ICONS[link.key] || FileText;
                    return (
                      <Tooltip key={link.href} label={link.label}>
                        <Link
                          href={link.href}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                        >
                          <LinkIcon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                          {link.label}
                        </Link>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-md px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900">
              {(user.full_name || user.username || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                {user.full_name || user.username}
              </div>
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {isRoot ? "Root User" : deptLabel}
              </div>
            </div>
          </div>
        )}

        <Tooltip label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            ) : (
              <Moon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </Tooltip>

        <Tooltip label="Log Out">
          <button
            type="button"
            onClick={() => {
              logout();
              if (onClose) onClose();
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            Log Out
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}