"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const router = useRouter()

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")

  async function handleLogin() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) { alert(error.message); return }

    const { data: userData } = await supabase
      .from("users").select("*").eq("id", data.user.id).single()

    if (!userData?.is_active) {
      alert("비활성화된 계정입니다.")
      await supabase.auth.signOut()
      return
    }

    router.push(userData.role === "partner" ? "/partner" : "/")
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-5 text-zinc-900">

      {/* 로고 영역 */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-600 tracking-tight">인터넷연구소</h1>
        <p className="text-zinc-400 text-sm mt-1">파트너님 환영합니다</p>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
        <div className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3.5 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3.5 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white rounded-2xl py-3.5 text-base font-semibold active:opacity-80 transition"
          >
            로그인
          </button>
        </div>
      </div>

      {/* 파트너 문의 */}
      <div className="w-full max-w-sm mt-4 bg-zinc-50 border border-zinc-200 rounded-3xl p-5">
        <p className="text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider">파트너 문의</p>
        <div className="space-y-2.5">
          <a href="mailto:hello@intlab.kr"
            className="flex items-center gap-3 text-sm text-zinc-700 hover:text-blue-600 transition">
            <span className="w-7 h-7 bg-white border border-zinc-200 rounded-xl flex items-center justify-center text-base shadow-sm">✉️</span>
            hello@intlab.kr
          </a>
          <a href="tel:16610966"
            className="flex items-center gap-3 text-sm text-zinc-700 hover:text-blue-600 transition">
            <span className="w-7 h-7 bg-white border border-zinc-200 rounded-xl flex items-center justify-center text-base shadow-sm">📞</span>
            1661-0966
          </a>
          <a href="https://intlab.kr" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 text-sm text-zinc-700 hover:text-blue-600 transition">
            <span className="w-7 h-7 bg-white border border-zinc-200 rounded-xl flex items-center justify-center text-base shadow-sm">🌐</span>
            <span>홈페이지 <span className="text-blue-500 font-medium">intlab.kr</span> 바로가기</span>
          </a>
        </div>
      </div>

    </main>
  )
}