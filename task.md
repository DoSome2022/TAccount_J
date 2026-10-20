# BizOps 企業級會計系統開發任務清單 (Task List)

## 📌 Phase 1: 專案初始化與資料庫架構 (Prisma 6 & Local DB)
- [x] 初始化 Next.js 16 專案（App Router, TypeScript, Tailwind CSS）
- [x] 安裝核心依賴：`@prisma/client`, `prisma`, `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`, `react-hook-form`, `zod`, `next-auth@5`, `dexie` (IndexedDB)
- [x] 設定 Prisma 6 Schema（雲端 DB）：
  - `User`, `Company`, `UserCompany`（多租戶隔離與 RBAC 角色）
  - `accounts`（科目表，`code` 為穩定主鍵）
  - `journal_entries` / `journal_lines`（支援 **Hash Chaining 雜湊鏈** 欄位）
  - `account_period_balances`（**期末結餘快照表**，用於解決效能瓶頸）
  - `audit_log`（完整異動與操作審計軌跡）
- [x] 設定前端 IndexedDB (Dexie.js) 與 **客戶端加密雲端草稿同步** 機制

## 📌 Phase 2: 安全性、多租戶與 Admin 邀請機制
- [x] 關閉公開註冊，實作 **Admin 邀請制**（邀請 Token 與啟用連結）
- [x] 設定 Auth.js v5 身份驗證與 **Multi-Tenant (多公司切換)** Middleware
- [x] 實作資料隔離（Tenant Isolation）與 **MFA (多因素認證)** 防護

## 📌 Phase 3: Local-First 資料流與高效運算引擎
- [x] 實作前端本地草稿填寫與**加密雲端草稿備份**（支援多裝置切換不丟失資料）
- [x] 實作前端表單驗證（React Hook Form + Zod），在本地初步檢查借貸平衡 ($\sum \text{Debit} === \text{Credit}$)
- [x] 實作 tRPC Push 同步機制：將本地草稿安全推送到雲端
- [x] 實作後端二次覆核防護網：伺服器驗證借貸平衡、計算 **Hash 雜湊鏈**後寫入雲端 PostgreSQL

## 📌 Phase 4: 高效總帳彙總與報表防篡改驗證
- [x] 開發基於**快照（Snapshots）與本期加總**的高效總帳查詢 API（套用 6 大類科目之獨立結算公式）
- [x] 開發資產負債表與損益表，並驗證會計恆等式：$\text{資產} + \text{費用} + \text{銷貨成本} = \text{負債} + \text{資本} + \text{收入}$
- [x] 開發 **Hash 鏈結完整性校驗工具**（隨時檢查歷史分錄是否遭到手動竄改）