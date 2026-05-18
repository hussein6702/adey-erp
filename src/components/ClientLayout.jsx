"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TooltipProvider } from "./ui/tooltip";

export function ClientLayout({ children }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    // Login page gets no sidebar, no padding, no chrome — just raw fullscreen
    return <TooltipProvider>{children}</TooltipProvider>;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen md:h-screen overflow-hidden">
          <div className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 lg:px-8">
            <div className="mx-auto max-w-7xl animate-fadeIn">
              {children}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
