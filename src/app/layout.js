import { DM_Sans } from "next/font/google";
import AppShell from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "ChocERP",
  description: "ERP for the chocolate company",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
