import { cookies } from "next/headers";
import { ADMIN_CSRF_COOKIE } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get(ADMIN_CSRF_COOKIE)?.value ?? "";

  return <DashboardClient csrfToken={csrfToken} />;
}
