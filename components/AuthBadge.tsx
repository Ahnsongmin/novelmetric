"use client";

// 헤더의 로그인 상태 표시. 계정 기능이 꺼진 환경(DB 키 없음)에서는 아무것도 그리지 않는다.

import { useEffect, useState } from "react";
import { fetchMe, logout } from "@/lib/session-client";

export default function AuthBadge({ next = "/dashboard" }: { next?: string }) {
  const [me, setMe] = useState<{ enabled: boolean; email: string | null } | null>(null);

  useEffect(() => {
    fetchMe().then(setMe);
  }, []);

  if (!me?.enabled) return null;

  if (!me.email) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className="rounded-full px-3 py-1.5 text-muted transition hover:text-foreground"
      >
        로그인
      </a>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className="hidden max-w-[10rem] truncate sm:inline" title={me.email}>
        {me.email}
      </span>
      <button
        type="button"
        onClick={async () => {
          await logout();
          location.reload();
        }}
        className="rounded-full border border-border px-2.5 py-1 transition hover:text-foreground"
      >
        로그아웃
      </button>
    </span>
  );
}
