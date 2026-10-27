import { Prisma } from "@/generated/prisma/client";

/**
 * 現金流量表（直接法）分類引擎
 *
 * 演算法（借貸平衡保證對帳）：
 *  1. 只處理「本期、POSTED、至少含一條現金科目線」的分錄（查詢見 ledger.cashFlow）
 *  2. 現金線（1101/1102）只決定現金淨變動，不進分類
 *  3. 每條非現金線的現金流量 = credit - debit（貸方科目＝現金流入、借方科目＝現金流出）
 *  4. 同一分錄的每條非現金線各自歸類，多線分錄自動精確拆分，無需比例分攤
 *  5. Σ 三類活動流量 = Σ 現金線 signed = 期末快照現金 - 期初快照現金
 *
 * 現金轉帳（1101 <-> 1102）現金線互抵、無非現金線，因此不產生任何報表列。
 * 科目表固定為 STANDARD_CHART；未在對照表中的科目一律落「其他營業收支」，
 * 保證分類總和永遠等於現金淨變動（不以隱藏差額方式對帳）。
 */

export type CashFlowSectionKey = "operating" | "investing" | "financing";

/** 現金與約當現金科目；新增現金科目時必須同步維護此清單 */
export const CASH_ACCOUNT_CODES = ["1101", "1102"] as const;

const CASH_ACCOUNT_SET: ReadonlySet<string> = new Set<string>(CASH_ACCOUNT_CODES);

const ZERO = new Prisma.Decimal(0);

type CashFlowRowDef = {
  section: CashFlowSectionKey;
  code: string; // 報表列穩定代碼（科目聚合列，非會計科目代碼）
  name: string;
  accounts: readonly string[];
};

const OTHER_OPERATING_ROW: CashFlowRowDef = {
  section: "operating",
  code: "OP99",
  name: "其他營業收支",
  accounts: [],
};

/** 科目 → 報表列；陣列順序即顯示順序，同一科目不可重複掛載 */
const CASH_FLOW_ROWS: readonly CashFlowRowDef[] = [
  { section: "operating", code: "OP01", name: "銷貨收現", accounts: ["4101", "4201", "1120"] },
  { section: "operating", code: "OP02", name: "支付供應商", accounts: ["5101", "1130", "2101"] },
  { section: "operating", code: "OP03", name: "支付薪資", accounts: ["6101", "2301"] },
  { section: "operating", code: "OP04", name: "支付租金", accounts: ["6102"] },
  { section: "operating", code: "OP05", name: "支付水電", accounts: ["6103"] },
  { section: "operating", code: "OP06", name: "支付其他費用", accounts: ["6201"] },
  OTHER_OPERATING_ROW,
  { section: "investing", code: "IV01", name: "購置設備", accounts: ["1201"] },
  { section: "investing", code: "IV99", name: "投資其他", accounts: ["1202"] },
  { section: "financing", code: "FI01", name: "借款", accounts: ["2201"] },
  { section: "financing", code: "FI02", name: "增資", accounts: ["3101"] },
  { section: "financing", code: "FI03", name: "盈餘分配", accounts: ["3201"] },
];

const ROW_BY_ACCOUNT = new Map<string, CashFlowRowDef>();
for (const row of CASH_FLOW_ROWS) {
  for (const accountCode of row.accounts) ROW_BY_ACCOUNT.set(accountCode, row);
}

export type CashFlowRow = {
  code: string;
  name: string;
  amount: Prisma.Decimal;
};

export type CashFlowSection = {
  rows: CashFlowRow[];
  total: Prisma.Decimal;
};

export type CashFlowSummary = {
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  totalFlows: Prisma.Decimal;
};

type CashFlowEntry = {
  lines: {
    accountCode: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
  }[];
};

/** 將本期含現金線的分錄彙總為三大活動（只輸出非零列） */
export function summarizeCashFlow(entries: CashFlowEntry[]): CashFlowSummary {
  const amounts = new Map<string, Prisma.Decimal>();

  for (const entry of entries) {
    // 防禦：即使呼叫端誤傳純非現金分錄，也不讓它產生流量
    if (!entry.lines.some((l) => CASH_ACCOUNT_SET.has(l.accountCode))) continue;

    for (const line of entry.lines) {
      if (CASH_ACCOUNT_SET.has(line.accountCode)) continue;
      const row = ROW_BY_ACCOUNT.get(line.accountCode) ?? OTHER_OPERATING_ROW;
      // 非現金借方（資產/費用增加）→ 現金流出（負）
      // 非現金貸方（負債/收入/資本增加）→ 現金流入（正）
      const flow = line.credit.minus(line.debit);
      amounts.set(row.code, (amounts.get(row.code) ?? ZERO).plus(flow));
    }
  }

  const build = (section: CashFlowSectionKey): CashFlowSection => {
    const rows = CASH_FLOW_ROWS.filter((r) => r.section === section)
      .map((r) => ({
        code: r.code,
        name: r.name,
        amount: amounts.get(r.code) ?? ZERO,
      }))
      .filter((r) => !r.amount.isZero());
    const total = rows.reduce((sum, r) => sum.plus(r.amount), ZERO);
    return { rows, total };
  };

  const operating = build("operating");
  const investing = build("investing");
  const financing = build("financing");
  return {
    operating,
    investing,
    financing,
    totalFlows: operating.total.plus(investing.total).plus(financing.total),
  };
}
