import Stripe from "stripe";

/**
 * Stripe 整合（以公司為收費單位）：
 *  - 金鑰尚未設定時回傳 null（無金鑰模式：全站功能照常運作，僅付款/Webhook 停用）
 *  - 正式使用前請在 .env 設定 STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_ID
 */
let stripeClient: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (stripeClient === undefined) {
    stripeClient = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY)
      : null;
  }
  return stripeClient;
}

export function getStripePriceId(): string | null {
  return process.env.STRIPE_PRICE_ID?.trim() || null;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
