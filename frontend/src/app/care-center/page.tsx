import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { CareCenterClient } from "@/components/care-center-client";
import { getCurrentUserFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function CareCenterPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="care-command care-center-page" dir="rtl">
      <AppNav active="care-center" className="dashboard-top-nav" />

      <CareCenterClient />
    </main>
  );
}
