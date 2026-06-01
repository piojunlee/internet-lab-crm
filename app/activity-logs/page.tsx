"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const PAGE_SIZE = 50

export default function ActivityLogsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [logs,        setLogs]        = useState<any[]>([])
  const [search,      setSearch]      = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(0)
  const [totalCount,  setTotalCount]  = useState(0)

  useEffect(() => { checkUser() }, [])

  // 페이지 또는 검색어 바뀔 때마다 재조회
  useEffect(() => {
    if (currentUser) fetchLogs(page, search)
  }, [page, search, currentUser])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    const { data: userData } = await supabase
      .from("users").select("*").eq("id", user.id).single()

    if (!userData?.is_active || userData.role !== "admin") {
      router.push("/"); return
    }

    setCurrentUser(userData)
  }

  async function fetchLogs(pageNum: number, keyword: string) {
    setLoading(true)

    const from = pageNum * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)

    // 서버 사이드 키워드 검색 (user_name, customer_name, action, new_value)
    if (keyword.trim()) {
      query = query.or(
        `user_name.ilike.%${keyword}%,customer_name.ilike.%${keyword}%,action.ilike.%${keyword}%,old_value.ilike.%${keyword}%,new_value.ilike.%${keyword}%`
      )
    }

    const { data, error, count } = await query

    if (error) { console.error(error) }
    setLogs(data || [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }

  function handleSearch() {
    setPage(0)
    setSearch(searchInput)
  }

  function handleClear() {
    setSearchInput("")
    setPage(0)
    setSearch("")
  }

  function formatDate(iso: string) {
    if (!iso) return "-"
    const d = new Date(iso)
    return d.toLocaleString("ko-KR", {
      year:   "numeric",
      month:  "2-digit",
      day:    "2-digit",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900 flex">

      {/* 사이드바 */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-bold mb-10">인터넷연구소</h1>
        <nav className="space-y-2">
          <button type="button" onClick={() => router.push("/")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
            대시보드
          </button>
          <button type="button" onClick={() => router.push("/customers")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
            고객관리
          </button>
          <button type="button" onClick={() => router.push("/partner")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
            파트너
          </button>
          <button type="button" onClick={() => router.push("/settlement")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
            정산관리
          </button>
          <button type="button"
            className="w-full text-left px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold">
            활동로그
          </button>
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <section className="flex-1 p-10 overflow-auto">

        {/* 헤더 */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">활동 로그</h1>
            <p className="text-zinc-400">사용자별 고객 데이터 변경 이력</p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition"
          >
            로그아웃
          </button>
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">

          {/* 검색 바 */}
          <div className="p-6 border-b border-zinc-200 flex items-center gap-3">
            <input
              type="text"
              placeholder="사용자명 / 고객명 / 작업 / 변경값 검색"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-[380px] bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button onClick={handleSearch}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition">
              검색
            </button>
            {search && (
              <button onClick={handleClear}
                className="bg-zinc-100 border border-zinc-300 px-4 py-2 rounded-xl text-sm text-zinc-700 hover:bg-zinc-200 transition">
                초기화
              </button>
            )}
            <span className="ml-auto text-sm text-zinc-400">
              총 {totalCount.toLocaleString()}건
            </span>
          </div>

          {/* 테이블 */}
          {loading ? (
            <div className="p-10 text-center text-zinc-400">불러오는 중...</div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-zinc-400">로그 없음</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    {["시간", "사용자", "고객명", "작업", "이전값", "변경값"].map((h) => (
                      <th key={h} className="text-left p-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-zinc-200 hover:bg-zinc-50 transition">
                      <td className="p-4 whitespace-nowrap text-zinc-500">{formatDate(log.created_at)}</td>
                      <td className="p-4 whitespace-nowrap font-medium">{log.user_name || "-"}</td>
                      <td className="p-4 whitespace-nowrap">{log.customer_name || "-"}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-medium">
                          {log.action || "-"}
                        </span>
                      </td>
                      <td className="p-4 text-zinc-500 max-w-[200px] truncate">{log.old_value || "-"}</td>
                      <td className="p-4 font-medium max-w-[200px] truncate">{log.new_value || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-zinc-200 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-sm bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                이전
              </button>

              {/* 페이지 번호 (최대 7개) */}
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 2)
                .reduce<(number | "…")[]>((acc, i, idx, arr) => {
                  if (idx > 0 && i - (arr[idx - 1] as number) > 1) acc.push("…")
                  acc.push(i)
                  return acc
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-zinc-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`w-8 h-8 rounded-lg text-sm transition ${
                        page === item
                          ? "bg-blue-600 text-white font-semibold"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      }`}
                    >
                      {(item as number) + 1}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-sm bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}