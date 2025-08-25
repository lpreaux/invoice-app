import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import Image from "next/image";
import { Button } from "~/components/ui/button";

export default function Invoices() {
  return (
    <main className={"min-h-screen w-full"}>
      <header className={"mx-6 my-8 flex items-center gap-4"}>
        <div className={"mr-auto"}>
          <h1 className={"mb-1 text-2xl font-bold tracking-tight"}>Invoices</h1>
          <p className={"text-muted-foreground"}>No invoices</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className={"flex items-center gap-3.5 text-lg font-bold tracking-tight"}>
            Filter <Image src="/icon-arrow-down.svg" alt="" width={10} height={5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem>Draft</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem>Pending</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem>Paid</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className={"p-[6px]"} size="lg">
          <div className={"flex h-8 w-8 items-center justify-center rounded-full bg-white"}>
            <Image src="/icon-plus.svg" alt="" width={10} height={5} />
          </div>
          New
        </Button>
      </header>
    </main>
  );
}
