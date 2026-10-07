import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return <DashboardClient user={user} />;
}
