import type { Metadata, Viewport } from "next";
import { Fraunces, Gowun_Batang, Jua, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 포근한 오피스 느낌: 영문 세리프(Fraunces) + 한글 바탕체(고운바탕) 제목, 본문은 읽기 쉬운 Noto Sans KR
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["400", "600"], style: ["normal", "italic"] });
const serifKr = Gowun_Batang({ weight: ["400", "700"], variable: "--font-serif-kr", preload: false });
// 킴대리 말풍선 · 도장: 동글동글한 만화 글꼴
const cartoon = Jua({ weight: "400", variable: "--font-cartoon", preload: false });
const sans = Noto_Sans_KR({ weight: ["400", "500", "700"], variable: "--font-sans", preload: false });

export const metadata: Metadata = {
  title: "딱세줄 · 회의록 3줄 요약",
  description: "회의를 시작할 때 켜 두고, 끝나면 핵심 요약 3줄 · 결정 사항 · 할 일 · 남은 질문으로 정리해 줍니다.",
  applicationName: "딱세줄",
  appleWebApp: { capable: true, title: "딱세줄", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F1E7" },
    { media: "(prefers-color-scheme: dark)", color: "#1F1B17" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${serifKr.variable} ${sans.variable} ${cartoon.variable}`}>
      <body>{children}</body>
    </html>
  );
}
