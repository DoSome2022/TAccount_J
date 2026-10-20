import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "@/server/trpc/context";

/** superjson 讓 Prisma.Decimal / Date 可跨 wire 序列化 */
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const procedure = t.procedure;
export const middleware = t.middleware;
