import { auth } from "@/auth";
import { prisma } from "@/server/db";
import { headers } from "next/headers";

export async function createContext() {
  const session = await auth();
  const h = await headers();
  return {
    session,
    prisma,
    ip: h.get("x-forwarded-for") ?? "127.0.0.1",
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
