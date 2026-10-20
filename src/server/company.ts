import { Prisma } from "@/generated/prisma/client";
import { genesisHash } from "@/server/accounting";
import { STANDARD_CHART } from "@/server/chartOfAccounts";

/**
 * 建立公司（含 hash 鏈創世區塊 + 標準科目表）。
 * 創世區塊以真實 company.id 計算並立即固化，之後永不可變。
 */
export async function createCompanyWithChart(
  tx: Prisma.TransactionClient,
  input: { name: string; code: string },
) {
  let company = await tx.company.create({
    data: { name: input.name, code: input.code, genesisHash: "pending" },
  });
  company = await tx.company.update({
    where: { id: company.id },
    data: { genesisHash: genesisHash(company.id) },
  });
  await tx.accountChart.createMany({
    data: STANDARD_CHART.map((a) => ({ companyId: company.id, ...a })),
  });
  return company;
}
