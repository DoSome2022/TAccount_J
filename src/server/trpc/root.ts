import { router } from "@/server/trpc/init";
import { draftRouter } from "@/server/trpc/routers/draft";
import { journalRouter } from "@/server/trpc/routers/journal";
import { accountRouter } from "@/server/trpc/routers/account";
import { inviteRouter } from "@/server/trpc/routers/invite";
import { mfaRouter } from "@/server/trpc/routers/mfa";
import { companyRouter } from "@/server/trpc/routers/company";
import { ledgerRouter } from "@/server/trpc/routers/ledger";
import { auditRouter } from "@/server/trpc/routers/audit";
import { userRouter } from "@/server/trpc/routers/user";

export const appRouter = router({
  draft: draftRouter,
  journal: journalRouter,
  account: accountRouter,
  invite: inviteRouter,
  mfa: mfaRouter,
  company: companyRouter,
  ledger: ledgerRouter,
  audit: auditRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
