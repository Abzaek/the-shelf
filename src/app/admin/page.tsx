import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { getAnalytics } from "@/server/analytics/report";
import { Dashboard } from "@/components/admin/dashboard";
import { env } from "@/server/env";
export const metadata = { title: "Admin Analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage() {
    const user = await getCurrentUser();
    if (!user)
        redirect("/login?next=/admin");
    if (user.role !== "admin")
        notFound();
    if (env.requireEmailVerification && !user.emailVerified)
        redirect("/verify");
    return <Dashboard initial={getAnalytics()} name={user.displayName || user.email}/>;
}
