/**
 * 一次性安裝 API（First-Run Bootstrap）：
 *  - 僅在資料庫 users 數量 = 0 時可用（交易內二次檢查，防並發搶設）
 *  - 可選 SETUP_TOKEN 環境變數防線（公網部署建議設定）
 *  - 建立：公司（含創世區塊 + 標準科目表）→ 第一個 OWNER 管理員
 *  - 完成後此 API 永久失效（無公開註冊鐵律）
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { createCompanyWithChart } from "@/server/company";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Za-z0-9]{2,10}$/;

// 速率限制：同一 IP 15 分鐘內最多 5 次嘗試
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

class SetupClosedError extends Error {}
class InvalidInputError extends Error {}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const rec = attempts.get(ip) ?? { count: 0, firstAt: Date.now() };
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    rec.count = 0;
    rec.firstAt = Date.now();
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "嘗試次數過多，請稍後再試" }, { status: 429 });
  }
  attempts.set(ip, rec);

  const body = await req.json().catch(() => ({}));

  // SETUP_TOKEN 防線（若有設定環境變數，必須輸入正確 token）
  if (process.env.SETUP_TOKEN) {
    if (String(body.setupToken ?? "") !== process.env.SETUP_TOKEN) {
      rec.count++;
      return NextResponse.json({ code: "BAD_TOKEN", message: "安裝金鑰錯誤" }, { status: 403 });
    }
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const companyName = String(body.companyName ?? "").trim();
  const companyCode = String(body.companyCode ?? "").trim().toUpperCase();

  try {
    if (!name || name.length > 50) throw new InvalidInputError("請輸入姓名");
    if (!EMAIL_RE.test(email)) throw new InvalidInputError("Email 格式錯誤");
    if (password.length < 8 || password.length > 100) throw new InvalidInputError("密碼至少 8 位");
    if (!companyName || companyName.length > 100) throw new InvalidInputError("請輸入公司名稱");
    if (!CODE_RE.test(companyCode)) throw new InvalidInputError("公司代碼需為 2-10 位英數字");

    const result = await prisma.$transaction(async (tx) => {
      // 交易內二次檢查：0 用戶才可安裝（防兩人同時搶設）
      const userCount = await tx.user.count();
      if (userCount > 0) throw new SetupClosedError();

      const company = await createCompanyWithChart(tx, {
        name: companyName,
        code: companyCode,
      });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          emailVerified: new Date(),
        },
      });
      await tx.userCompany.create({
        data: { userId: user.id, companyId: company.id, role: "OWNER" },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: user.id,
          action: "SETUP_COMPLETE",
          entity: "Company",
          entityId: company.id,
          details: { email, companyCode },
          ip,
        },
      });
      return { ok: true };
    });

    attempts.delete(ip);
    return NextResponse.json(result);
  } catch (e) {
    rec.count++;
    if (e instanceof SetupClosedError) {
      return NextResponse.json({ code: "ALREADY_SETUP", message: "系統已完成安裝" }, { status: 409 });
    }
    if (e instanceof InvalidInputError) {
      return NextResponse.json({ code: "INVALID_INPUT", message: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { code: "DUPLICATE", message: "Email 或公司代碼已存在" },
        { status: 409 },
      );
    }
    console.error("setup failed:", e);
    return NextResponse.json({ code: "INTERNAL", message: "安裝失敗，請稍後重試" }, { status: 500 });
  }
}
