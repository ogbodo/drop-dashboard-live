import { cookies } from "next/headers";
import { ADMIN_CSRF_COOKIE } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard-client";
import SafetyAlertBubble from "@/app/components/SafetyAlertBubble";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get(ADMIN_CSRF_COOKIE)?.value ?? "";

  return (
    <>
      <DashboardClient csrfToken={csrfToken} />
      {/* Mounted here rather than in the root layout: that also wraps the login
          page, where polling would run for someone who is not signed in. */}
      <SafetyAlertBubble />
    </>
  );
}
