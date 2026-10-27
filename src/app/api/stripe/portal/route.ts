import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { getStripe } from "@/server/stripe";

/**
 * 建立 Stripe Customer Portal Session（管理/取消訂閱）。
 * 僅公司的 OWNER；無金鑰或尚無 Stripe Customer 時回 503。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "UNAUTHORIZED", message: "請先登入" }, { status: 401 });
  }
  const companyId = session.activeCompanyId;
  if (!companyId) {
    return NextResponse.json({ code: "FORBIDDEN", message: "尚未選擇公司" }, { status: 403 });
  }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ code: "FORBIDDEN", message: "僅公司負責人（OWNER）可管理訂閱" }, { status: 403 });
  }

  const stripe = getStripe();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!stripe || !company?.stripeCustomerId) {
    return NextResponse.json(
      { code: "STRIPE_NOT_CONFIGURED", message: "尚未設定 Stripe 金鑰或尚無付款記錄" },
      { status: 503 },
    );
  }

  try {
    const base = req.nextUrl.origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${base}/dashboard/settings/billing`,
    });
    return NextResponse.json({ ok: true, url: portal.url });
  } catch (e) {
    return NextResponse.json(
      { code: "INTERNAL", message: e instanceof Error ? e.message : "建立管理連結失敗" },
      { status: 500 },
    );
  }
}
