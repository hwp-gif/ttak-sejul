import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "딱세줄 · 회의록 3줄 요약기",
  description: "회의 메모를 붙여 넣으면 핵심 요약 3줄 · 결정 사항 · 할 일 · 남은 질문으로 정리해 줍니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
