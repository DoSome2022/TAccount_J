"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

/**
 * 強制登出（凍結／訂閱失效時由 dashboard layout 掛載）。
 * 必須走 client 端 signOut：Next 16 的 Server Component 不能修改 cookie。
 */
export function ForceSignOut({ code }: { code: "ACCOUNT_FROZEN" | "SUBSCRIPTION_INACTIVE" }) {
  useEffect(() => {
    void signOut({ redirect: true, callbackUrl: `/login?code=${code}` });
  }, [code]);
  return null;
}
