import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "说开 SHUOKAI — 理解，不必同意";
const description = "先各自说清，再一起看懂。一个帮助两个人准确表达、看见分歧并决定下一步的结构化沟通工具。";
const fallbackOrigin = "https://shuokai.me";

function resolveOrigin(hostHeader: string | null, protocolHeader: string | null) {
  const host = hostHeader?.split(",", 1)[0]?.trim() ?? "";
  const forwardedProtocol = protocolHeader?.split(",", 1)[0]?.trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.includes("localhost") ? "http" : "https";

  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(host)) {
    return fallbackOrigin;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return fallbackOrigin;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const origin = resolveOrigin(
    incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host"),
    incomingHeaders.get("x-forwarded-proto"),
  );

  return {
    title,
    description,
    metadataBase: new URL(origin),
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_CN",
      siteName: "说开 SHUOKAI",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "说开 — 理解，不必同意" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

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
