import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/server/auth";
import { adminUsers, isRegistrationOpen, overview, recentAudit } from "@/server/admin";
import { env } from "@/server/env";
import { UsersAdmin } from "@/components/admin/users-admin";

export const metadata = { title: "Users & access", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/admin/users");
  if (!isAdmin(viewer)) notFound();
  if (env.requireEmailVerification && !viewer.emailVerified) redirect("/verify");
  return (
    <UsersAdmin
      viewer={viewer}
      initial={{ users: adminUsers.list(), overview: await overview(), audit: recentAudit(60), registrationOpen: isRegistrationOpen() }}
    />
  );
}
