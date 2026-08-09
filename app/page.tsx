import type { Metadata } from "next";
import { redirect } from "next/navigation";

const productUrl = process.env.SHUOKAI_H5_URL
  ?? "https://shuokai-supabase-test.shuokai.workers.dev/";

export const metadata: Metadata = {
  title: "说开 SHUOKAI — 理解，不必同意",
  description:
    "当聊天失效，换一种方式说开。一个帮助两个人准确表达、看见分歧并形成下一步的结构化沟通工具。",
};

export default function Home() {
  redirect(productUrl);
}
