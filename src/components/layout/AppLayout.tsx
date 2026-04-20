import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ToastViewport } from "@/components/ui/Toast";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-zinc-50 text-zinc-900">
      <div className="print:hidden">
        <Header />
      </div>
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 overflow-x-hidden px-4 py-6 print:max-w-none print:px-0 print:py-0 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <div className="print:hidden">
        <Footer />
        <ToastViewport />
      </div>
    </div>
  );
}
