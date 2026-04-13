import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Adey ERP – Chocolatier Management System",
  description: "Internal ERP system for Adey Chocolatier – production, inventory, HR, and operations management.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col md:flex-row bg-background">
        <TooltipProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen md:h-screen overflow-hidden">
            <div className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 lg:px-8">
              <div className="mx-auto max-w-7xl animate-fadeIn">
                {children}
              </div>
            </div>
          </main>
        </TooltipProvider>
      </body>
    </html>
  );
}
