import { redirect } from "next/navigation";
import { TempMailboxPanel } from "@/components/TempMailboxPanel";
import { getPublicConfig } from "@/lib/api";

export default async function TempMailboxPage() {
  const config = await getPublicConfig();
  if (!config.tempMailEnabled) redirect("/claim");
  return <TempMailboxPanel />;
}