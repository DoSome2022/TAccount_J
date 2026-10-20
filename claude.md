# Claude 協作開發規範 (AI Context & Rules)

## 🧠 核心領域背景
本專案為 **BizOps 企業級會計系統**，採用 **Local-First + 加密草稿同步** 與 **複式記帳法**。核心技術堆疊為 **Next.js 16 + tRPC + React Hook Form + Prisma 6 (PostgreSQL) + Auth.js v5 + Dexie.js**。

## 🔒 企業級資安與架構鐵律（絕對不能違反）
1. **三層數據邊界與草稿加密**：
   - 本地 IndexedDB 存放原始發票與草稿，並透過客戶端加密後同步至雲端備份（雲端無法解密未確認草稿），解決多裝置遺失問題。
2. **效能優化鐵律（避免全表掃描）**：
   - 總帳與報表計算嚴禁直接對數百萬筆 `journal_lines` 跑 `SUM()`。必須採用 **「期末結餘快照 (`account_period_balances`) + 本期異動」** 的增量計算模型。
3. **防竄改雜湊鏈 (Cryptographic Hash Chaining)**：
   - 每一筆正式寫入的 `journal_entry` 必須透過 SHA-256 綁定上一筆的 `hash`（$\text{Hash}_n = \text{SHA256}(\text{Hash}_{n-1} + \text{Data})$）。任何後台資料庫直接竄改行為都會被雜湊校驗抓包。
4. **Admin 專屬邀請制與 Audit Log**：無公開註冊，且所有關鍵異動寫入 `audit_log`。

## ⚙️ 會計核心鐵律（絕對不能違反）
1. **複式記帳平衡**：任何同步到雲端的 Journal Entry 必須強制符合 $\sum \text{Debit} = \text{Credit}$。
2. **六大類科目與獨立公式**：
   - 資產 (1xxx, 借): 餘額 = 期初 + $\sum \text{借} - \sum \text{貸}$
   - 負債 (2xxx, 貸): 餘額 = 期初 + $\sum \text{貸} - \sum \text{借}$
   - 資本 (3xxx, 貸): 餘額 = 期初 + $\sum \text{貸} - \sum \text{借}$
   - 收入 (4xxx, 貸): 餘額 = 期初 + $\sum \text{貸} - \sum \text{借}$
   - 銷貨成本 (5xxx, 借): 餘額 = 期初 + $\sum \text{借} - \sum \text{貸}$
   - 費用 (6xxx, 借): 餘額 = 期初 + $\sum \text{借} - \sum \text{貸}$
3. **穩定主鍵**：`journal_lines.account_code` 必須穩定引用 `accounts.code`。