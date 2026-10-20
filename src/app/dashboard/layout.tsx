import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { TRPCProvider } from "@/components/trpc-provider";
import { Shell } from "@/components/shell";
import { signOutAction } from "@/app/dashboard/actions";

export const instant = false; // session 讀取需動態渲染

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  if (!session?.user) redirect("/login");

  const companies =
    session.activeCompanyId != null
      ? await prisma.userCompany.findMany({
          where: { userId: session.user.id },
          include: { company: { select: { id: true, name: true, code: true } } },
          orderBy: { company: { createdAt: "asc" } },
        })
      : [];

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
        signOutAction={signOutAction}
      >
        {children}
      </Shell>
    </TRPCProvider>
  );
}
