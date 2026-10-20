import { AccountType, DebitCredit } from "@/generated/prisma/enums";

/** 標準六大類科目表（code 為穩定主鍵）— seed 與 /setup 共用 */
export const STANDARD_CHART: {
  code: string;
  name: string;
  type: AccountType;
  normal: DebitCredit;
}[] = [
  // 1xxx 資產 (借)
  { code: "1101", name: "現金", type: AccountType.ASSET, normal: DebitCredit.DEBIT },
  { code: "1102", name: "銀行存款", type: AccountType.ASSET, normal: DebitCredit.DEBIT },
  { code: "1120", name: "應收帳款", type: AccountType.ASSET, normal: DebitCredit.DEBIT },
  { code: "1130", name: "存貨", type: AccountType.ASSET, normal: DebitCredit.DEBIT },
  { code: "1201", name: "設備", type: AccountType.ASSET, normal: DebitCredit.DEBIT },
  { code: "1202", name: "累計折舊", type: AccountType.ASSET, normal: DebitCredit.CREDIT },
  // 2xxx 負債 (貸)
  { code: "2101", name: "應付帳款", type: AccountType.LIABILITY, normal: DebitCredit.CREDIT },
  { code: "2201", name: "短期借款", type: AccountType.LIABILITY, normal: DebitCredit.CREDIT },
  { code: "2301", name: "應付薪資", type: AccountType.LIABILITY, normal: DebitCredit.CREDIT },
  // 3xxx 資本 (貸)
  { code: "3101", name: "股本", type: AccountType.EQUITY, normal: DebitCredit.CREDIT },
  { code: "3201", name: "保留盈餘", type: AccountType.EQUITY, normal: DebitCredit.CREDIT },
  // 4xxx 收入 (貸)
  { code: "4101", name: "銷貨收入", type: AccountType.REVENUE, normal: DebitCredit.CREDIT },
  { code: "4201", name: "服務收入", type: AccountType.REVENUE, normal: DebitCredit.CREDIT },
  // 5xxx 銷貨成本 (借)
  { code: "5101", name: "銷貨成本", type: AccountType.COGS, normal: DebitCredit.DEBIT },
  // 6xxx 費用 (借)
  { code: "6101", name: "薪資費用", type: AccountType.EXPENSE, normal: DebitCredit.DEBIT },
  { code: "6102", name: "租金費用", type: AccountType.EXPENSE, normal: DebitCredit.DEBIT },
  { code: "6103", name: "水電費用", type: AccountType.EXPENSE, normal: DebitCredit.DEBIT },
  { code: "6104", name: "折舊費用", type: AccountType.EXPENSE, normal: DebitCredit.DEBIT },
  { code: "6201", name: "雜項費用", type: AccountType.EXPENSE, normal: DebitCredit.DEBIT },
];
