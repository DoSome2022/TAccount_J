import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getStripe, getStripeWebhookSecret } from "@/server/stripe";

/** Stripe 訂閱狀態 → 系統狀態（無試用期；三種可付費狀態歸 PAST_DUE） */
function mapStripeStatus(status: string): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  if (status === "active") return "ACTIVE";
  if (status === "canceled") return "CANCELED";
  return "PAST_DUE"; // past_due / incomplete / incomplete_expired / unpaid / paused
}

/**
 * Stripe Webhook（需在 Stripe Dashboard 註冊，並以 STRIPE_WEBHOOK_SECRET 驗簽）。
 * 更新公司的訂閱狀態；事件由系統觸發，audit log 的 userId 為 null。
 * 冪等：事件重送只會重複寫入相同狀態。
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = getStripeWebhookSecret();
  if (!stripe || !secret) {
    return NextResponse.json(
      { code: "STRIPE_NOT_CONFIGURED", message: "尚未設定 Stripe 金鑰（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ code: "INVALID_SIGNATURE", message: "簽章驗證失敗" }, { status: 400 });
  }

  try {
    const type = event.type;
    let companyId: string | null = null;
    let nextStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | null = null;
    let currentPeriodEnd: Date | null = null;
    let customerId: string | null = null;
    let subscriptionId: string | null = null;

    if (type === "checkout.session.completed") {
      const s = event.data.object;
      companyId = (s.client_reference_id as string | null) ?? null;
      customerId = (s.customer as string | null) ?? null;
      subscriptionId = (s.subscription as string | null) ?? null;
      nextStatus = "ACTIVE";
      // currentPeriodEnd 交由隨後到來的 customer.subscription.updated 事件更新
    } else if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
      const s = event.data.object;
      customerId = (s.customer as string | null) ?? null;
      subscriptionId = s.id as string;
      nextStatus = type === "customer.subscription.deleted" ? "CANCELED" : mapStripeStatus(s.status as string);
      const periodEnd = (s as unknown as { current_period_end?: number }).current_period_end;
      currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    } else if (type === "invoice.payment_failed") {
      const inv = event.data.object;
      customerId = (inv.customer as string | null) ?? null;
      nextStatus = "PAST_DUE";
    } else {
      return NextResponse.json({ received: true, ignored: type });
    }

    const company =
      (subscriptionId
        ? await prisma.company.findUnique({ where: { stripeSubscriptionId: subscriptionId } })
        : null) ??
      (customerId ? await prisma.company.findUnique({ where: { stripeCustomerId: customerId } }) : null) ??
      (companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null);

    if (!company) {
      return NextResponse.json({ received: true, ignored: "unknown-company" });
    }

    await prisma.$transaction([
      prisma.company.update({
        where: { id: company.id },
        data: {
          ...(customerId && !company.stripeCustomerId ? { stripeCustomerId: customerId } : {}),
          ...(subscriptionId && !company.stripeSubscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
          ...(nextStatus ? { subscriptionStatus: nextStatus } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId: company.id,
          userId: null, // 系統事件（Stripe webhook），無登入操作者
          action: "SUBSCRIPTION_UPDATED",
          entity: "Company",
          entityId: company.id,
          details: { event: type, status: nextStatus ?? company.subscriptionStatus },
          ip: req.headers.get("x-forwarded-for") ?? null,
        },
      }),
    ]);

    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json(
      { code: "INTERNAL", message: e instanceof Error ? e.message : "處理 webhook 失敗" },
      { status: 500 },
    );
  }
}
