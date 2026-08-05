import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "说开 SHUOKAI — 理解，不必同意",
  description:
    "一个帮助两个人准确表达、看见分歧并形成下一步的结构化沟通工具。",
  openGraph: {
    title: "说开 SHUOKAI — 理解，不必同意",
    description: "当普通聊天失效，换一个空间把话说开。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
