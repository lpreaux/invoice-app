"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  useSidebar,
} from "~/components/ui/sidebar";
import Image from "next/image";
import { cn } from "~/lib/utils";

export default function AppSidebar() {
  const { isMobile } = useSidebar();
  return (
    <Sidebar className={"overflow-hidden rounded-r-md"}>
      <SidebarHeader
        className={
          "bg-sidebar-primary after:bg-secondary relative overflow-hidden rounded-r-md p-8 after:absolute after:top-1/2 after:left-0 after:h-full after:w-full after:rotate-180 after:rounded-r-md after:content-['']"
        }
      >
        <div className={"z-10"}>
          <Image src="/logo.svg" alt="logo" width={28} height={26} />
        </div>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter className={cn("items-center gap-6", isMobile ? "mr-6" : "mb-6")}>
        <Image
          src="/icon-moon.svg"
          alt="dark mode"
          width={20}
          height={20}
          className="text-sidebar-foreground cursor-pointer"
        ></Image>
        <SidebarSeparator />
        <div className={"overflow-hidden rounded-full"}>
          <Image src="/image-avatar.jpg" alt="avatar" width={40} height={40} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
