import Image from "next/image";

export default function InvoicesList() {
  if (true) {
    return (
      <div className={"mx-auto mt-15 flex w-58 flex-col items-center gap-10 text-center"}>
        <Image src="/illustration-empty.svg" alt="" width={200} height={160} />
        <div>
          <p className={"mb-6 text-2xl font-bold tracking-tight"}>There is nothing here</p>
          <p className={"text-muted-foreground"}>
            Create an invoice by clicking the <strong>New</strong> button and get started
          </p>
        </div>
      </div>
    );
  }
  return null;
}
