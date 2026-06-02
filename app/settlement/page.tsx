"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

// ─── 상품별 파트너 정산 기본값 ────────────────────────────────────────────────
function getCommission(product: string): number {
  if (product === "인터넷 단독") return 30000
  return 50000
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

function downloadCSV(rows: any[][], filename: string) {
  const BOM = "﻿"
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function SettlementPage() {
  const router = useRouter()

  const [activeTab,     setActiveTab]     = useState<"partner" | "all">("partner")
  const [currentUser,   setCurrentUser]   = useState<any>(null)
  const [applications,  setApplications]  = useState<any[]>([])  // 파트너 탭
  const [allApps,       setAllApps]       = useState<any[]>([])  // 전체 탭
  const [partnerMap,    setPartnerMap]    = useState<Record<string, any>>({})
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))

  // 파트너 탭 필터
  const [statusFilter,  setStatusFilter]  = useState("전체")
  const [partnerSearch, setPartnerSearch] = useState("")

  // 전체 탭 필터
  const [allStatus,     setAllStatus]     = useState("전체")
  const [allSearch,     setAllSearch]     = useState("")
  const [allStartDate,  setAllStartDate]  = useState("")
  const [allEndDate,    setAllEndDate]    = useState("")
  const [allPeriod,     setAllPeriod]     = useState("전체")

  const [loading,       setLoading]       = useState(true)
  const [processing,    setProcessing]    = useState<string | null>(null)
  const [peekApp,       setPeekApp]       = useState<any>(null)

  // 전체 탭 인라인 금액 편집
  const [editAmounts,   setEditAmounts]   = useState<Record<string, string>>({})

  // ── 날짜 헬퍼 ──
  function toStr(d: Date) { return d.toISOString().slice(0, 10) }

  function applyPeriod(period: string) {
    setAllPeriod(period)
    const today = new Date()
    const dow   = today.getDay() // 0=일, 1=월 ...

    if (period === "전체") {
      setAllStartDate(""); setAllEndDate(""); return
    }
    if (period === "이번주") {
      const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7))
      const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
      setAllStartDate(toStr(mon)); setAllEndDate(toStr(sun)); return
    }
    if (period === "지난주") {
      const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7) - 7)
      const sun = new Date(mon);   sun.setDate(mon.getDate() + 6)
      setAllStartDate(toStr(mon)); setAllEndDate(toStr(sun)); return
    }
    if (period === "이번달") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      setAllStartDate(toStr(first)); setAllEndDate(toStr(last)); return
    }
    if (period === "지난달") {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last  = new Date(today.getFullYear(), today.getMonth(), 0)
      setAllStartDate(toStr(first)); setAllEndDate(toStr(last)); return
    }
  }

  useEffect(() => { checkUser() }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace("/login"); return }

    const { data: userData } = await supabase
      .from("users").select("*").eq("id", user.id).single()

    if (!userData?.is_active) { router.replace("/login"); return }
    if (userData.role !== "admin") {
      alert("잘못된 접근입니다.")
      router.replace(userData.role === "partner" ? "/partner" : "/")
      return
    }

    setCurrentUser(userData)
    await fetchData()
  }

  async function fetchData() {
    setLoading(true)

    // 파트너 탭: 설치완료 + ref_code 있는 것
    const { data: apps } = await supabase
      .from("applications")
      .select("*")
      .eq("status", "설치완료")
      .not("ref_code", "is", null)
      .order("activation_date", { ascending: false })

    // 전체 탭: 설치완료 전체
    const { data: all } = await supabase
      .from("applications")
      .select("*")
      .eq("status", "설치완료")
      .order("activation_date", { ascending: false })

    // 파트너 정보
    const { data: partners } = await supabase
      .from("users")
      .select("id, name, ref_code, bank_name, account_holder, bank_account")
      .eq("role", "partner")

    const map: Record<string, any> = {}
    for (const p of partners || []) {
      if (p.ref_code) map[p.ref_code] = p
    }

    setApplications(apps || [])
    setAllApps(all || [])
    setPartnerMap(map)
    setLoading(false)
  }

  // ── 파트너 탭: 정산처리 (partner_* 컬럼) ──
  async function processPartnerSettlement(app: any) {
    setProcessing(app.id)
    const { error } = await supabase
      .from("applications")
      .update({
        partner_settlement_status:  "정산완료",
        partner_commission_amount:  getCommission(app.product),
        partner_settlement_date:    new Date().toISOString().slice(0, 10),
      })
      .eq("id", app.id)
    if (error) { alert("처리 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  async function revertPartnerSettlement(app: any) {
    if (!confirm(`${app.customer_name} 고객의 정산완료를 정산대기로 되돌리겠습니까?`)) return
    setProcessing(app.id)
    const { error } = await supabase
      .from("applications")
      .update({
        partner_settlement_status:  "정산대기",
        partner_commission_amount:  0,
        partner_settlement_date:    null,
      })
      .eq("id", app.id)
    if (error) { alert("복구 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  // ── 전체 탭: 금액 저장 (blur 시) ──
  async function saveInternalAmount(app: any) {
    const raw = editAmounts[app.id]
    if (raw === undefined) return
    const amount = parseInt(raw) || 0
    await supabase
      .from("applications")
      .update({ internal_settlement_amount: amount })
      .eq("id", app.id)
    fetchData()
  }

  // ── 전체 탭: 정산처리 (internal_* 컬럼) ──
  async function processInternalSettlement(app: any) {
    setProcessing(app.id)
    const amount = parseInt(editAmounts[app.id] ?? "") || app.internal_settlement_amount || 0
    const { error } = await supabase
      .from("applications")
      .update({
        internal_settlement_status:  "정산완료",
        internal_settlement_amount:  amount,
        internal_settlement_date:    new Date().toISOString().slice(0, 10),
      })
      .eq("id", app.id)
    if (error) { alert("처리 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  async function revertInternalSettlement(app: any) {
    if (!confirm(`${app.customer_name} 고객의 정산완료를 정산대기로 되돌리겠습니까?`)) return
    setProcessing(app.id)
    const { error } = await supabase
      .from("applications")
      .update({
        internal_settlement_status:  "정산대기",
        internal_settlement_amount:  0,
        internal_settlement_date:    null,
      })
      .eq("id", app.id)
    if (error) { alert("복구 실패"); setProcessing(null); return }
    setProcessing(null)
    fetchData()
  }

  // ── 파트너 탭 필터 & 집계 ──
  const filtered = applications.filter((app) => {
    const monthMatch   = !selectedMonth || (app.activation_date || "").startsWith(selectedMonth)
    const statusMatch  = statusFilter === "전체" || (app.partner_settlement_status || "정산대기") === statusFilter
    const partnerMatch = !partnerSearch.trim() ||
      String(app.partner_name || "").toLowerCase().includes(partnerSearch.toLowerCase())
    return monthMatch && statusMatch && partnerMatch
  })

  const pendingList  = filtered.filter((a) => (a.partner_settlement_status || "정산대기") === "정산대기")
  const doneList     = filtered.filter((a) => a.partner_settlement_status === "정산완료")
  const pendingTotal = pendingList.reduce((s, a) => s + getCommission(a.product), 0)
  const doneTotal    = doneList.reduce((s, a) => s + (a.partner_commission_amount || 0), 0)

  async function bulkSettlePartner() {
    if (pendingList.length === 0) { alert("정산 대기 건이 없습니다"); return }
    if (!confirm(`${pendingList.length}건을 일괄 정산처리 하시겠습니까?`)) return
    const today = new Date().toISOString().slice(0, 10)
    await Promise.all(pendingList.map((app) =>
      supabase.from("applications").update({
        partner_settlement_status: "정산완료",
        partner_commission_amount: getCommission(app.product),
        partner_settlement_date:   today,
      }).eq("id", app.id)
    ))
    fetchData()
  }

  function handleDownloadPartner() {
    const headers = ["고객명", "파트너", "은행", "예금주", "계좌번호", "상품", "정산금액(원)", "정산상태", "개통일자", "정산처리일"]
    const rows = filtered.map((app) => {
      const p = partnerMap[app.ref_code] || {}
      return [
        app.customer_name || "", p.name || app.partner_name || "",
        p.bank_name || "", p.account_holder || "", p.bank_account || "",
        app.product || "", app.partner_commission_amount || getCommission(app.product),
        app.partner_settlement_status || "정산대기",
        app.activation_date || "", app.partner_settlement_date || "",
      ]
    })
    downloadCSV([headers, ...rows], `파트너정산_${selectedMonth || "전체"}.csv`)
  }

  // ── 전체 탭 필터 & 집계 ──
  const filteredAll = allApps.filter((app) => {
    const d = app.activation_date || ""
    const dateMatch = (!allStartDate || d >= allStartDate) && (!allEndDate || d <= allEndDate)
    const statusMatch = allStatus === "전체" || (app.internal_settlement_status || "정산대기") === allStatus
    const searchMatch = !allSearch.trim() ||
      String(app.customer_name || "").toLowerCase().includes(allSearch.toLowerCase()) ||
      String(app.phone || "").replace(/-/g, "").includes(allSearch) ||
      String(app.manager || "").toLowerCase().includes(allSearch.toLowerCase())
    return dateMatch && statusMatch && searchMatch
  })

  const allPendingList  = filteredAll.filter((a) => (a.internal_settlement_status || "정산대기") === "정산대기")
  const allDoneList     = filteredAll.filter((a) => a.internal_settlement_status === "정산완료")
  const allPendingTotal = allPendingList.reduce((s, a) =>
    s + (parseInt(editAmounts[a.id] ?? "") || a.internal_settlement_amount || 0), 0)
  const allDoneTotal = allDoneList.reduce((s, a) => s + (a.internal_settlement_amount || 0), 0)

  async function bulkSettleAll() {
    if (allPendingList.length === 0) { alert("정산 대기 건이 없습니다"); return }
    if (!confirm(`${allPendingList.length}건을 일괄 정산처리 하시겠습니까?`)) return
    const today = new Date().toISOString().slice(0, 10)
    await Promise.all(allPendingList.map((app) =>
      supabase.from("applications").update({
        internal_settlement_status: "정산완료",
        internal_settlement_amount: parseInt(editAmounts[app.id] ?? "") || app.internal_settlement_amount || 0,
        internal_settlement_date:   today,
      }).eq("id", app.id)
    ))
    fetchData()
  }

  function handleDownloadAll() {
    const headers = ["고객명", "연락처", "은행", "예금주", "계좌번호", "담당자", "파트너", "정산금액(원)", "정산상태", "개통일자", "정산처리일"]
    const rows = filteredAll.map((app) => [
      app.customer_name || "", app.phone || "",
      app.bank_name || "", app.account_holder || "", app.account_number || "",
      app.manager || "", app.partner_name || "",
      app.internal_settlement_amount || 0,
      app.internal_settlement_status || "정산대기",
      app.activation_date || "", app.internal_settlement_date || "",
    ])
    downloadCSV([headers, ...rows], `전체정산_${selectedMonth || "전체"}.csv`)
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900 flex">

      {/* 사이드바 */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-bold mb-10">인터넷연구소</h1>
        <nav className="space-y-2">
          <button type="button" onClick={() => router.push("/")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">대시보드</button>
          <button type="button" onClick={() => router.push("/customers")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">고객관리</button>
          <button type="button" onClick={() => router.push("/partner")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">파트너</button>
          <button type="button"
            className="w-full text-left px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold">정산관리</button>
          <button type="button" onClick={() => router.push("/activity-logs")}
            className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">활동로그</button>
        </nav>
      </aside>

      {/* 메인 */}
      <section className="flex-1 p-10 overflow-auto">

        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">정산 관리</h1>
            <p className="text-zinc-400">
              인터넷 단독 <strong className="text-zinc-700">3만원</strong> &nbsp;/&nbsp; 그 외 <strong className="text-zinc-700">5만원</strong>
            </p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition">
            로그아웃
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          {([
            { key: "partner", label: `파트너 정산 (${applications.length})` },
            { key: "all",     label: `전체 고객 정산 (${allApps.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-6 py-2.5 rounded-2xl text-sm font-semibold transition ${
                activeTab === key
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-500 border border-zinc-200 hover:bg-zinc-50"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ 파트너 정산 탭 ══ */}
        {activeTab === "partner" && (
          <>
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
              <div className="p-6 border-b border-zinc-200 flex items-center gap-3 flex-wrap">
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={filterSelectCls} />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterSelectCls}>
                  <option value="전체">전체 정산상태</option>
                  <option value="정산대기">정산대기</option>
                  <option value="정산완료">정산완료</option>
                </select>
                <input type="text" placeholder="파트너 검색" value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)} className={`${filterInputCls} w-36`} />
                <span className="text-sm text-zinc-400">총 {filtered.length}건</span>
                <div className="ml-auto flex gap-2">
                  {pendingList.length > 0 && (
                    <button onClick={bulkSettlePartner}
                      className="bg-amber-500 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition">
                      일괄 정산처리 ({pendingList.length}건)
                    </button>
                  )}
                  <button onClick={handleDownloadPartner}
                    className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
                    엑셀 다운로드
                  </button>
                </div>
              </div>

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
                        const isPending = (app.partner_settlement_status || "정산대기") === "정산대기"
                        const isWorking = processing === app.id
                        return (
                          <tr key={app.id} className="border-t border-zinc-200 hover:bg-zinc-50 transition">
                            <td className="p-4 whitespace-nowrap">
                              <button onClick={() => setPeekApp(app)}
                                className="font-medium text-blue-600 hover:underline underline-offset-2">
                                {app.customer_name || "-"}
                              </button>
                            </td>
                            <td className="p-4 whitespace-nowrap">{partner.name || app.partner_name || "-"}</td>
                            <td className="p-4">
                              <span className="text-zinc-700">{partner.bank_name || "-"}</span>
                              <span className="text-zinc-300 mx-1.5">/</span>
                              <span className="text-zinc-700">{partner.account_holder || "-"}</span>
                              <span className="text-zinc-300 mx-1.5">/</span>
                              <span className="font-medium text-zinc-900">{partner.bank_account || "-"}</span>
                            </td>
                            <td className="p-4 whitespace-nowrap">{app.product || "-"}</td>
                            <td className="p-4 whitespace-nowrap font-semibold text-blue-600">
                              {(app.partner_commission_amount || getCommission(app.product)).toLocaleString()}원
                            </td>
                            <td className="p-4 whitespace-nowrap text-zinc-500">{app.activation_date || "-"}</td>
                            <td className="p-4 whitespace-nowrap">
                              {app.partner_settlement_date
                                ? <span className="text-green-700 font-medium">{app.partner_settlement_date}</span>
                                : <span className="text-zinc-300">-</span>}
                            </td>
                            <td className="p-4">
                              <SettlementBadge status={app.partner_settlement_status} />
                            </td>
                            <td className="p-4">
                              {isPending ? (
                                <button onClick={() => processPartnerSettlement(app)} disabled={isWorking}
                                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                                  {isWorking ? "처리중..." : "정산처리"}
                                </button>
                              ) : (
                                <button onClick={() => revertPartnerSettlement(app)} disabled={isWorking}
                                  className="bg-zinc-100 text-zinc-500 border border-zinc-300 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition">
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
          </>
        )}

        {/* ══ 전체 고객 정산 탭 ══ */}
        {activeTab === "all" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "정산 대상", value: `${filteredAll.length}건`,              color: "text-zinc-900" },
                { label: "정산 대기", value: `${allPendingTotal.toLocaleString()}원`, color: "text-amber-500" },
                { label: "정산 완료", value: `${allDoneTotal.toLocaleString()}원`,    color: "text-green-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-zinc-500 text-sm mb-2">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-zinc-200 space-y-3">
                {/* 기간 빠른 선택 + 날짜 직접입력 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(["전체", "이번주", "지난주", "이번달", "지난달"] as const).map((p) => (
                    <button key={p} onClick={() => applyPeriod(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                        allPeriod === p
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      }`}>
                      {p}
                    </button>
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <input type="date" value={allStartDate}
                      onChange={(e) => { setAllStartDate(e.target.value); setAllPeriod("직접") }}
                      className={filterSelectCls} />
                    <span className="text-zinc-400 text-sm">~</span>
                    <input type="date" value={allEndDate}
                      onChange={(e) => { setAllEndDate(e.target.value); setAllPeriod("직접") }}
                      className={filterSelectCls} />
                  </div>
                </div>
                {/* 상태 필터 + 검색 + 건수 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <select value={allStatus} onChange={(e) => setAllStatus(e.target.value)} className={filterSelectCls}>
                    <option value="전체">전체 정산상태</option>
                    <option value="정산대기">정산대기</option>
                    <option value="정산완료">정산완료</option>
                  </select>
                  <input type="text" placeholder="고객명 / 연락처 / 담당자" value={allSearch}
                    onChange={(e) => setAllSearch(e.target.value)} className={`${filterInputCls} w-48`} />
                  <span className="text-sm text-zinc-400">총 {filteredAll.length}건</span>
                  <div className="ml-auto flex gap-2">
                    {allPendingList.length > 0 && (
                      <button onClick={bulkSettleAll}
                        className="bg-amber-500 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition">
                        일괄 정산처리 ({allPendingList.length}건)
                      </button>
                    )}
                    <button onClick={handleDownloadAll}
                      className="bg-green-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
                      엑셀 다운로드
                    </button>
                  </div>
                </div>
              </div>

              {filteredAll.length === 0 ? (
                <div className="p-10 text-center text-zinc-400">
                  {selectedMonth ? `${selectedMonth} 정산 데이터가 없습니다` : "설치완료 데이터 없음"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-500">
                      <tr>
                        {["고객명", "연락처", "은행", "예금주", "계좌번호", "정산금액 (직접입력)", "담당자", "파트너", "개통일자", "정산처리일", "정산상태", "처리"].map((h) => (
                          <th key={h} className="text-left p-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAll.map((app) => {
                        const isPending = (app.internal_settlement_status || "정산대기") === "정산대기"
                        const isWorking = processing === app.id
                        return (
                          <tr key={app.id} className="border-t border-zinc-200 hover:bg-zinc-50 transition">
                            <td className="p-4 whitespace-nowrap">
                              <button onClick={() => setPeekApp(app)}
                                className="font-medium text-blue-600 hover:underline underline-offset-2">
                                {app.customer_name || "-"}
                              </button>
                            </td>
                            <td className="p-4 whitespace-nowrap text-zinc-500">{app.phone || "-"}</td>
                            <td className="p-4 whitespace-nowrap">{app.bank_name || "-"}</td>
                            <td className="p-4 whitespace-nowrap">{app.account_holder || "-"}</td>
                            <td className="p-4 whitespace-nowrap">{app.account_number || "-"}</td>
                            <td className="p-4 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  value={editAmounts[app.id] ?? (app.internal_settlement_amount || "")}
                                  onChange={(e) => setEditAmounts((prev) => ({ ...prev, [app.id]: e.target.value }))}
                                  onBlur={() => saveInternalAmount(app)}
                                  placeholder="금액 입력"
                                  className="w-28 border border-zinc-300 rounded-lg px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                                <span className="text-xs text-zinc-400">원</span>
                              </div>
                            </td>
                            <td className="p-4 whitespace-nowrap">{app.manager || "-"}</td>
                            <td className="p-4 whitespace-nowrap">{app.partner_name || "-"}</td>
                            <td className="p-4 whitespace-nowrap text-zinc-500">{app.activation_date || "-"}</td>
                            <td className="p-4 whitespace-nowrap">
                              {app.internal_settlement_date
                                ? <span className="text-green-700 font-medium">{app.internal_settlement_date}</span>
                                : <span className="text-zinc-300">-</span>}
                            </td>
                            <td className="p-4">
                              <SettlementBadge status={app.internal_settlement_status} />
                            </td>
                            <td className="p-4">
                              {isPending ? (
                                <button onClick={() => processInternalSettlement(app)} disabled={isWorking}
                                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                                  {isWorking ? "처리중..." : "정산처리"}
                                </button>
                              ) : (
                                <button onClick={() => revertInternalSettlement(app)} disabled={isWorking}
                                  className="bg-zinc-100 text-zinc-500 border border-zinc-300 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition">
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
          </>
        )}
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
              <button onClick={() => setPeekApp(null)} className="text-zinc-400 hover:text-zinc-700 text-lg leading-none">✕</button>
            </div>
            <div className="space-y-2">
              {[
                { label: "설치주소",  value: peekApp.address        || "-" },
                { label: "통신사",    value: peekApp.carrier         || "-" },
                { label: "상품",      value: peekApp.product         || "-" },
                { label: "접수일자",  value: peekApp.receipt_date    || "-" },
                { label: "개통일자",  value: peekApp.activation_date || "-" },
                { label: "담당자",    value: peekApp.manager         || "-" },
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