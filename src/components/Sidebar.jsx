"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ChefHat,
  Truck,
  ArrowDownToLine,
  FileSpreadsheet,
  Archive,
  Menu,
  X,
  ShoppingCart,
  Store,
  Users,
  Wrench,
  PackagePlus,
  FileText,
  ChevronDown,
  LogOut,
  Settings,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import Image from "next/image";

// Name mappings exactly as they appear in the database for dynamic matching if needed, 
// though we can map manually below.
const navGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Products",
    items: [
      { name: "Product List", href: "/goods", icon: Package },
      { name: "Recipes", href: "/recipes", icon: ChefHat },
      { name: "Molds", href: "/molds", icon: Wrench },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "Raw Materials", href: "/raw-materials", icon: Boxes },
      { name: "Packaging Materials", href: "/packaging-materials", icon: PackagePlus },
    ],
  },
  {
    label: "Departments",
    items: [
      { name: "Shop", href: "/shop", icon: Store },
      { name: "Kitchen", href: "/kitchen", icon: ChefHat },
      // Internal store view logic
    ]
  },
  {
    label: "Requests",
    items: [
      { name: "Request Materials", href: "/request-materials", icon: FileSpreadsheet },
      { name: "Purchase Requests", href: "/purchase-requests", icon: ShoppingCart },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "GRN", href: "/grn", icon: ArrowDownToLine },
      { name: "Daily Production Log", href: "/daily-production", icon: ChefHat },
      { name: "Production Sheets", href: "/production-sheets", icon: FileText },
      { name: "Delivery Notes", href: "/delivery-notes", icon: Truck },
    ],
  },
  {
    label: "Management",
    items: [
      { name: "Suppliers", href: "/suppliers", icon: Users },
      { name: "HR Management", href: "/hr", icon: Users },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Archive", href: "/archive", icon: Archive },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [authContext, setAuthContext] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    setIsLoadingAuth(true);
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setAuthContext(data);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingAuth(false));
  }, [pathname]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const canSeeModule = (itemName) => {
    if (itemName === 'Dashboard') return true;
    if (isLoadingAuth) return true; // Show items optimistically or just skeleton, let's show so it doesn't flicker empty
    if (!authContext) return true;  // fallback visually 
    if (authContext.user?.role?.toLowerCase() === 'root') return true;
    return authContext.visibleModules?.includes(itemName);
  };

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden bg-card/80 backdrop-blur-sm shadow-md border"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[260px] transform bg-card border-r border-border/50 transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex md:flex-col print:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo + Brand */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <img
            src="/brownLogo.svg"
            alt="Adey"
            width={36}
            height={36}
            className="flex-shrink-0"
          />
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">Adey ERP</h1>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Chocolatier Management</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 sidebar-scroll">
          {navGroups.map((group) => {
            const isCollapsed = collapsed[group.label];
            const visibleItems = group.items.filter(item => canSeeModule(item.name));
            
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      isCollapsed && "-rotate-90"
                    )}
                  />
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5 mt-0.5">
                    {visibleItems.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href));
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
                            isActive
                              ? "bg-amber-900/10 text-amber-900 shadow-sm border border-amber-200/50"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-amber-800" : "")} />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border/50">
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 flex items-center justify-between">
            <div className="text-left">
              <p className="text-[11px] font-medium text-muted-foreground">
                 {isLoadingAuth ? 'Loading...' : authContext?.user?.role === 'Root' ? 'Root Access' : 'Staff View'}
              </p>
              <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                 {isLoadingAuth ? '' : authContext?.user?.username || 'Guest'}
              </p>
            </div>
            {authContext && (
               <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign Out">
                 <LogOut className="w-4 h-4 text-red-500/80" />
               </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
