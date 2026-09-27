import { redirect } from "next/navigation";
import { latestGazetteDate } from "@/lib/queries";
import { todayIso } from "@/lib/format";

export const dynamic = "force-dynamic";
export default async function GazetteIndex() {
  redirect(`/resmi-gazete/${(await latestGazetteDate()) ?? todayIso()}`);
}
