import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/server/auth";
import { getUserAnalytics } from "@/server/analytics/report";
import { env } from "@/server/env";
import { UserProfile } from "@/components/admin/user-profile";
export const metadata = { title: "Reader Analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function UserPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const viewer = await getCurrentUser();
    if (!viewer)
        redirect("/login?next=/admin");
    if (!isAdmin(viewer))
        notFound();
    if (env.requireEmailVerification && !viewer.emailVerified)
        redirect("/verify");
    const { id } = await params;
    const data = getUserAnalytics(id);
    if (!data)
        notFound();
    return <div className="an-shell"><main className="an-profile"><Link className="an-button" href="/admin"><ArrowLeft size={14}/>Back to analytics</Link><UserProfile data={data}/></main></div>;
}
