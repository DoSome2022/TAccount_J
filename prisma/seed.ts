/**
 * 種子腳本（本機開發用）：
 *  - 管理員帳號由環境變數 ADMIN_EMAIL / ADMIN_PASSWORD 指定（預設示範值）
 *  - 示範分錄（9 筆）僅在「非 production」環境灌入
 *  - 正式環境請使用 /setup 一次性安裝頁（或 db seed 只會建立乾淨的 admin + 公司 + 科目表）
 */
import { prisma } from "../src/server/db";
import { postEntry } from "../src/server/services/posting";
import { recomputeChain } from "../src/server/hashchain";
import { genesisHash } from "../src/server/accounting";
import { STANDARD_CHART } from "../src/server/chartOfAccounts";
import bcrypt from "bcryptjs";

const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@bizops.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin@123456";

/** 示範分錄（全部借貸平衡，僅開發環境灌入） */
const SAMPLE_ENTRIES = [
  {
    entryDate: "2026-09-01",
    description: "開業投入資本",
    lines: [
      { accountCode: "1101", debit: "1000000.00", credit: "0" },
      { accountCode: "3101", debit: "0", credit: "1000000.00" },
    ],
  },
  {
    entryDate: "2026-09-05",
    description: "購置辦公設備",
    lines: [
      { accountCode: "1201", debit: "200000.00", credit: "0" },
      { accountCode: "1102", debit: "0", credit: "200000.00" },
    ],
  },
  {
    entryDate: "2026-09-20",
    description: "現銷收入（銷貨）",
    lines: [
      { accountCode: "1101", debit: "150000.00", credit: "0" },
      { accountCode: "4101", debit: "0", credit: "150000.00" },
    ],
  },
  {
    entryDate: "2026-09-20",
    description: "結轉銷貨成本",
    lines: [
      { accountCode: "5101", debit: "90000.00", credit: "0" },
      { accountCode: "1130", debit: "0", credit: "90000.00" },
    ],
  },
  {
    entryDate: "2026-09-30",
    description: "九月薪資（應付）",
    lines: [
      { accountCode: "6101", debit: "50000.00", credit: "0" },
      { accountCode: "2301", debit: "0", credit: "50000.00" },
    ],
  },
  {
    entryDate: "2026-10-05",
    description: "十月辦公室租金",
    lines: [
      { accountCode: "6102", debit: "30000.00", credit: "0" },
      { accountCode: "1102", debit: "0", credit: "30000.00" },
    ],
  },
  {
    entryDate: "2026-10-10",
    description: "銷貨收入（銀行入帳）",
    lines: [
      { accountCode: "1102", debit: "80000.00", credit: "0" },
      { accountCode: "4101", debit: "0", credit: "80000.00" },
    ],
  },
  {
    entryDate: "2026-10-10",
    description: "結轉銷貨成本（十月）",
    lines: [
      { accountCode: "5101", debit: "45000.00", credit: "0" },
      { accountCode: "1130", debit: "0", credit: "45000.00" },
    ],
  },
];

async function main() {
  console.log("🌱 開始建立種子資料…");

  // --- 使用者 ---
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      name: "系統管理員",
      emailVerified: new Date(),
    },
  });

  // 開發用示範會計帳號（正式環境不建立）
  let accountant: { id: string } | null = null;
  if (!IS_PROD) {
    accountant = await prisma.user.upsert({
      where: { email: "accountant@bizops.dev" },
      update: {},
      create: {
        email: "accountant@bizops.dev",
        passwordHash: await bcrypt.hash("Accountant@123456", 12),
        name: "示範會計",
        emailVerified: new Date(),
      },
    });
  }

  // --- 公司 ---
  let company = await prisma.company.findUnique({ where: { code: "DEMO" } });
  if (!company) {
    company = await prisma.company.create({
      // 示範公司視為已付費（ACTIVE），否則開發環境會被訂閱閘門擋在付款頁
      data: {
        name: "示範公司（Demo Co.）",
        code: "DEMO",
        genesisHash: "pending",
        subscriptionStatus: "ACTIVE",
      },
    });
  }
  // 創世區塊：以真實 company.id 計算，且在公司建立後立即固化（之後永不可變）
  if (company.genesisHash === "pending") {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { genesisHash: genesisHash(company.id) },
    });
  }

  // --- 成員綁定 ---
  const members: { user: { id: string }; role: "OWNER" | "ACCOUNTANT" }[] = [
    { user: admin, role: "OWNER" },
  ];
  if (accountant) members.push({ user: accountant, role: "ACCOUNTANT" });
  for (const m of members) {
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: m.user.id, companyId: company.id } },
      update: {},
      create: { userId: m.user.id, companyId: company.id, role: m.role },
    });
  }

  // --- 科目表（共用標準六大類科目） ---
  for (const a of STANDARD_CHART) {
    await prisma.accountChart.upsert({
      where: { companyId_code: { companyId: company.id, code: a.code } },
      update: {},
      create: { companyId: company.id, ...a },
    });
  }

  // --- 示範分錄（僅開發環境；走真實 postEntry 服務） ---
  const existingCount = await prisma.journalEntry.count({ where: { companyId: company.id } });
  if (!IS_PROD && existingCount === 0) {
    for (const e of SAMPLE_ENTRIES) {
      const r = await postEntry({
        companyId: company.id,
        userId: admin.id,
        entryDate: e.entryDate,
        description: e.description,
        lines: e.lines,
        ip: "127.0.0.1 (seed)",
      });
      console.log(`  ✓ #${String(r.entryNo).padStart(3, "0")} ${e.description}  hash=${r.hash.slice(0, 16)}…`);
    }
  } else if (IS_PROD) {
    console.log("  ⏭ production 環境：略過示範分錄（0 筆，乾淨帳本）");
  } else {
    console.log(`  ⏭ 已有 ${existingCount} 筆分錄，跳過`);
  }

  // --- 種子後完整性校驗 ---
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: company.id, status: "POSTED" },
    orderBy: { entryNo: "asc" },
    include: {
      lines: {
        select: {
          accountCode: true,
          debit: true,
          credit: true,
          description: true,
        },
      },
    },
  });
  const broken = recomputeChain(
    company.genesisHash,
    entries.map((e) => ({
      entryNo: e.entryNo,
      entryDate: e.entryDate,
      description: e.description,
      hash: e.hash,
      prevHash: e.prevHash,
      status: e.status,
      lines: e.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit.toFixed(2),
        credit: l.credit.toFixed(2),
        description: l.description,
      })),
    })),
  );
  if (broken.length === 0) {
    console.log(`🔗 Hash 鏈完整性校驗通過（${entries.length} 筆）`);
  } else {
    console.error(`💥 Hash 鏈斷裂 ${broken.length} 處！`, broken);
    process.exit(1);
  }

  console.log("✅ 種子完成。登入帳號：");
  console.log(`   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (OWNER)`);
  if (!IS_PROD) console.log("   accountant@bizops.dev / Accountant@123456 (ACCOUNTANT)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
