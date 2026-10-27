import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { getStripe, getStripePriceId } from "@/server/stripe";

/**
 * 建立 Stripe Checkout Session（訂閱付款）。
 * 僅公司的 OWNER 可付款；無金鑰時回 503 STRIPE_NOT_CONFIGURED。
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
    return NextResponse.json({ code: "FORBIDDEN", message: "僅公司負責人（OWNER）可付款" }, { status: 403 });
  }

  const stripe = getStripe();
  const priceId = getStripePriceId();
  if (!stripe || !priceId) {
    return NextResponse.json(
      { code: "STRIPE_NOT_CONFIGURED", message: "尚未設定 Stripe 金鑰（STRIPE_SECRET_KEY / STRIPE_PRICE_ID）" },
      { status: 503 },
    );
  }

  try {
    let company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ code: "NOT_FOUND", message: "公司不存在" }, { status: 404 });
    }

    // 找或建 Stripe Customer（綁定公司）
    if (!company.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: session.user.email ?? undefined,
        name: company.name,
        metadata: { companyId },
      });
      company = await prisma.company.update({
        where: { id: companyId },
        data: { stripeCustomerId: customer.id },
      });
    }

    const base = req.nextUrl.origin;
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: company.stripeCustomerId!,
      client_reference_id: companyId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/dashboard/settings/billing?checkout=success`,
      cancel_url: `${base}/dashboard/settings/billing?checkout=canceled`,
      metadata: { companyId },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e) {
    return NextResponse.json(
      { code: "INTERNAL", message: e instanceof Error ? e.message : "建立付款連結失敗" },
      { status: 500 },
    );
  }
}
