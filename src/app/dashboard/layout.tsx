import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { TRPCProvider } from "@/components/trpc-provider";
import { Shell } from "@/components/shell";
import { ForceSignOut } from "@/components/force-signout";
import { signOutAction } from "@/app/dashboard/actions";

export const instant = false; // session 讀取需動態渲染

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  if (!session?.user) redirect("/login");

  // 凍結／訂閱狀態即時檢查（JWT 有效 30 天，不能只信 session）
  const [user, companies] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isFrozen: true },
    }),
    session.activeCompanyId != null
      ? prisma.userCompany.findMany({
          where: { userId: session.user.id },
          include: {
            company: {
              select: {
                id: true,
                name: true,
                code: true,
                subscriptionStatus: true,
              },
            },
          },
          orderBy: { company: { createdAt: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  const activeMembership = companies.find((c) => c.companyId === session.activeCompanyId);
  const subscriptionStatus = activeMembership?.company.subscriptionStatus ?? "ACTIVE";

  // 帳號被凍結 → client 端強制登出（Server Component 不能改 cookie）
  if (user?.isFrozen) {
    return <ForceSignOut code="ACCOUNT_FROZEN" />;
  }
  // 非 OWNER 且公司訂閱未生效 → 擋在門外（OWNER 是付款人，可登入至付款頁）
  if (activeMembership && activeMembership.role !== "OWNER" && subscriptionStatus !== "ACTIVE") {
    return <ForceSignOut code="SUBSCRIPTION_INACTIVE" />;
  }

  // OWNER 未付費：Shell 會顯示紅 banner 並限制只能到付款頁（UX 層限制）
  const billingBlocked =
    activeMembership?.role === "OWNER" && subscriptionStatus !== "ACTIVE";

  return (
    <TRPCProvider>
      <Shell
        userName={session.user.name}
        userEmail={session.user.email}
        companies={companies.map((c) => ({
          companyId: c.company.id,
          name: c.company.name,
          code: c.company.code,
          role: c.role,
        }))}
        activeCompanyId={session.activeCompanyId}
        activeRole={session.activeRole}
        billingBlocked={billingBlocked}
        signOutAction={signOutAction}
      >
        {children}
      </Shell>
    </TRPCProvider>
  );
}
