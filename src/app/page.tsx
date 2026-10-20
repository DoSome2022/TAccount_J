import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";

export const instant = false;

export default async function Home() {
  await connection(); // Auth.js 初始化含 crypto.getRandomValues，需於請求時渲染
  const session = await auth();
  redirect(session ? "/dashboard" : "/login");
}
