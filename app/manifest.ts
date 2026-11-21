import type { MetadataRoute } from "next";

// PWA: 폰에서 "홈 화면에 추가"하면 주소창 없이 앱처럼 열린다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "딱세줄 · 회의록 3줄 요약",
    short_name: "딱세줄",
    description: "회의를 시작할 때 켜 두고, 끝나면 세 줄로 정리하는 회의 메모 앱",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F1E7",
    theme_color: "#F6F1E7",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
