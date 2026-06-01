"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

// ─── 상품별 정산 금액 ──────────────────────────────────────────────────────────
function getCommission(product: string): number {
  if (product === "인터넷 단독") return 30000
  return 50000  // 인터넷+TV, 인터넷+TV+셋탑
}

const filterSelectCls = "bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900"
const filterInputCls  = "bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-100"

function SettlementBadge({ status }: { status: string }) {
  const s = status || "정산대기"
  const color = s === "정산완료" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {s}
    </span>
  )
}

// ─── CSV 다운로드 (UTF-8 BOM → 엑셀 한글 정상 출력) ──────────────────────────
function downloadCSV(rows: any[][], filename: string) {
  const BOM = "﻿"
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function SettlementPage() {
  const router = useRouter()

  const [currentUser,    setCurrentUser]    = useState<any>(null)
  const [applications,   setApplications]   = useState<any[]>([])
  const [partnerMap,     setPartnerMap]     = useState<Record<string, any>>({})
  const [selectedMonth,  setSelectedMonth]  = useState(() => new Date().toISOString().slice(0, 7))
  const [statusFilter,   setStatusFilter]   = useState("전체")
  const [partnerSearch,  setPartnerSearch]  = useState("")
  const [loading,        setLoading]        = useState(true)
  const [processing,     setProcessing]     = useState<string | null>(null)
  const [peekApp,        setPeekApp]        = useState<any>(null)

  useEffect(() => { checkUser() }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace("/login")
      return
    }

    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!userData?.is_active) {
      router.replace("/login")
      return
    }

    if (userData.role !== "admin") {
      alert("잘못된 접근입니다.")

      router.replace(
        userData.role === "partner"
          ? "/partner"
          : "/"
      )

      return
    }

    setCurrentUser(userData)
    await fetchData()
  }

  async function fetchData() {
    setLoading(true)

    // 파트너가 연결된 설치완료 고객 전체
    const { data: apps, error: appErr } = await supabase
      .from("applications")
      .select("*")
      .eq("status", "설치완료")
      .not("ref_code", "is", null)
      .order("activation_date", { ascending: false })

    if (appErr) console.error(appErr)

    // 파트너 은행 정보
    const { data: partners, error: partnerErr } = await supabase
      .from("users")
      .select("id, name, ref_code, bank_name, account_holder, bank_account")
      .eq("role", "partner")

    if (partnerErr) console.error(partnerErr)

    // ref_code → partner 매핑
    const map: Record<string, any> = {}
    for (const p of partners || []) {
      if (p.ref_code) map[p.ref_code] = p
    }

    setApplications(apps || [])
    setPartnerMap(map)
    setLoading(false)
  }

  // ── 정산처리 (날짜 함께 저장) ──
  async function processSettlement(app: any) {
    setProcessing(app.id)
    const today = new Date().toISOString().slice(0, 10)

    const { error } = await supabase
      .from("applications")
      .update({
        settlement_status: "정산완료",
        commission_amount: getCommission(app.product),
        settlement_date:   today,
      })
      .eq("id", app.id)

    if (error) { console.error(error); alert("처리 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  // ── 정산 되돌리기 (날짜도 초기화) ──
  async function revertSettlement(app: any) {
    if (!confirm(`${app.customer_name} 고객의 정산완료를 정산대기로 되돌리겠습니까?`)) return
    setProcessing(app.id)

    const { error } = await supabase
      .from("applications")
      .update({
        settlement_status: "정산대기",
        commission_amount: 0,
        settlement_date:   null,
      })
      .eq("id", app.id)

    if (error) { console.error(error); alert("복구 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  // ── 일괄 정산처리 ──
  async function bulkSettle() {
    const targets = filtered.filter((a) => (a.settlement_status || "정산대기") === "정산대기")
    if (targets.length === 0) { alert("정산 대기 건이 없습니다"); return }
    if (!confirm(`${targets.length}건을 일괄 정산처리 하시겠습니까?`)) return

    const today = new Date().toISOString().slice(0, 10)
    const updates = targets.map((app) =>
      supabase.from("applications").update({
        settlement_status: "정산완료",
        commission_amount: getCommission(app.product),
        settlement_date:   today,
      }).eq("id", app.id)
    )
    await Promise.all(updates)
    fetchData()
  }

  // ── 필터 (월 + 정산상태 + 파트너명) ──
  const filtered = applications.filter((app) => {
    const monthMatch   = !selectedMonth  || (app.activation_date || "").startsWith(selectedMonth)
    const statusMatch  = statusFilter === "전체" || (app.settlement_status || "정산대기") === statusFilter
    const partnerMatch = !partnerSearch.trim() ||
      String(app.partner_name || "").toLowerCase().includes(partnerSearch.toLowerCase())
    return monthMatch && statusMatch && partnerMatch
  })

  // ── 집계 ──
  const pendingList  = filtered.filter((a) => (a.settlement_status || "정산대기") === "정산대기")
  const doneList     = filtered.filter((a) => a.settlement_status === "정산완료")
  const pendingTotal = pendingList.reduce((s, a) => s + getCommission(a.product), 0)
  const doneTotal    = doneList.reduce((s, a) => s + getCommission(a.product), 0)

  // ── CSV 다운로드 ──
  function handleDownload() {
    const headers = ["고객명", "파트너", "은행", "예금주", "계좌번호", "상품", "정산금액(원)", "정산상태", "개통일자", "정산처리일"]
    const rows = filtered.map((app) => {
      const p = partnerMap[app.ref_code] || {}
      return [
        app.customer_name     || "",
        p.name || app.partner_name || "",
        p.bank_name           || "",
        p.account_holder      || "",
        p.bank_account        || "",
        app.product           || "",
        getCommission(app.product),
        app.settlement_status || "정산대기",
        app.activation_date   || "",
        app.settlement_date   || "",
      ]
    })
    downloadCSV([headers, ...rows], `정산_${selectedMonth || "전체"}.csv`)
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────

  if (loading) {
    return null
  }

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
          <button type="button"
            className="w-full text-left px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold">
            정산관리
          </button>
          <button type="button" onClick={() => router.push("/activity-logs")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
            활동로그
          </button>
        </nav>
      </aside>

      {/* 메인 */}
      <section className="flex-1 p-10 overflow-auto">

        {/* 헤더 */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">정산 관리</h1>
            <p className="text-zinc-400">
              파트너 정산 처리 &nbsp;·&nbsp; 인터넷 단독 <strong className="text-zinc-700">3만원</strong> &nbsp;/&nbsp; 그 외 <strong className="text-zinc-700">5만원</strong>
            </p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition">
            로그아웃
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "정산 대상", value: `${filtered.length}건`,              color: "text-zinc-900" },
            { label: "정산 대기", value: `${pendingTotal.toLocaleString()}원`, color: "text-amber-500" },
            { label: "정산 완료", value: `${doneTotal.toLocaleString()}원`,    color: "text-green-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <p className="text-zinc-500 text-sm mb-2">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">

          {/* 필터 + 다운로드 */}
          <div className="p-6 border-b border-zinc-200 flex items-center gap-3 flex-wrap">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={filterSelectCls}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterSelectCls}>
              <option value="전체">전체 정산상태</option>
              <option value="정산대기">정산대기</option>
              <option value="정산완료">정산완료</option>
            </select>
            <input
              type="text"
              placeholder="파트너 검색"
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
              className={`${filterInputCls} w-36`}
            />
            <span className="text-sm text-zinc-400">총 {filtered.length}건</span>

            <div className="ml-auto flex gap-2">
              {pendingList.length > 0 && (
                <button onClick={bulkSettle}
                  className="bg-amber-500 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition">
                  일괄 정산처리 ({pendingList.length}건)
                </button>
              )}
              <button onClick={handleDownload}
                className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
                엑셀 다운로드
              </button>
            </div>
          </div>

          {/* 테이블 */}
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-zinc-400">
              {selectedMonth ? `${selectedMonth} 정산 데이터가 없습니다` : "설치완료 + 파트너 연결 데이터 없음"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    {["고객명", "파트너", "은행 정보 (은행 / 예금주 / 계좌번호)", "상품", "정산금액", "개통일자", "정산처리일", "정산상태", "처리"].map((h) => (
                      <th key={h} className="text-left p-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((app) => {
                    const partner   = partnerMap[app.ref_code] || {}
                    const isPending = (app.settlement_status || "정산대기") === "정산대기"
                    const isWorking = processing === app.id

                    return (
                      <tr key={app.id} className="border-t border-zinc-200 hover:bg-zinc-50 transition">
                        <td className="p-4 whitespace-nowrap">
                          <button
                            onClick={() => setPeekApp(app)}
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline underline-offset-2 transition"
                          >
                            {app.customer_name || "-"}
                          </button>
                        </td>
                        <td className="p-4 whitespace-nowrap">{partner.name || app.partner_name || "-"}</td>
                        <td className="p-4">
                          <span className="text-zinc-700">{partner.bank_name      || "-"}</span>
                          <span className="text-zinc-300 mx-1.5">/</span>
                          <span className="text-zinc-700">{partner.account_holder || "-"}</span>
                          <span className="text-zinc-300 mx-1.5">/</span>
                          <span className="font-medium text-zinc-900">{partner.bank_account || "-"}</span>
                        </td>
                        <td className="p-4 whitespace-nowrap">{app.product || "-"}</td>
                        <td className="p-4 whitespace-nowrap font-semibold text-blue-600">
                          {getCommission(app.product).toLocaleString()}원
                        </td>
                        <td className="p-4 whitespace-nowrap text-zinc-500">{app.activation_date  || "-"}</td>
                        <td className="p-4 whitespace-nowrap">
                          {app.settlement_date
                            ? <span className="text-green-700 font-medium">{app.settlement_date}</span>
                            : <span className="text-zinc-300">-</span>}
                        </td>
                        <td className="p-4">
                          <SettlementBadge status={app.settlement_status} />
                        </td>
                        <td className="p-4">
                          {isPending ? (
                            <button
                              onClick={() => processSettlement(app)}
                              disabled={isWorking}
                              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                              {isWorking ? "처리중..." : "정산처리"}
                            </button>
                          ) : (
                            <button
                              onClick={() => revertSettlement(app)}
                              disabled={isWorking}
                              className="bg-zinc-100 text-zinc-500 border border-zinc-300 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition"
                            >
                              {isWorking ? "복구중..." : "되돌리기"}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 고객 미리보기 모달 */}
      {peekApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setPeekApp(null)} />
          <div className="relative bg-white border border-zinc-200 rounded-3xl shadow-2xl w-80 p-6">

            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-xl font-bold text-zinc-900">{peekApp.customer_name || "-"}</p>
                <p className="text-sm text-zinc-400 mt-0.5">{peekApp.phone || "-"}</p>
              </div>
              <button onClick={() => setPeekApp(null)}
                className="text-zinc-400 hover:text-zinc-700 text-lg leading-none transition">✕</button>
            </div>

            <div className="space-y-2">
              {[
                { label: "설치주소",  value: peekApp.address          || "-" },
                { label: "통신사",    value: peekApp.carrier           || "-" },
                { label: "상품",      value: peekApp.product           || "-" },
                { label: "접수일자",  value: peekApp.receipt_date      || "-" },
                { label: "개통일자",  value: peekApp.activation_date   || "-" },
                { label: "담당자",    value: peekApp.manager           || "-" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-3 bg-zinc-50 rounded-xl px-4 py-2.5">
                  <span className="text-xs text-zinc-400 w-16 shrink-0 mt-0.5">{label}</span>
                  <span className="text-sm font-medium text-zinc-800 break-all">{value}</span>
                </div>
              ))}
            </div>

            <button onClick={() => setPeekApp(null)}
              className="mt-4 w-full bg-zinc-100 text-zinc-600 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-200 transition">
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  )
}