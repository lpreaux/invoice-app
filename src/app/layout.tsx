import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import AppSidebar from "~/components/app-sidebar";
import { SidebarProvider } from "~/components/ui/sidebar";

export const metadata: Metadata = {
  title: "Invoice App",
  description: "Gestionnaire de factures réalisé pour le challenge Frontend Mentor.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>
          <SidebarProvider>
            <AppSidebar />
            {children}
          </SidebarProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
