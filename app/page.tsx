"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

// ─── 상수 ────────────────────────────────────────────────────────────────────

const HIDDEN_STATUSES = ["청약완료", "설치완료", "해지안내완료", "보류요청", "취소"]
const CARRIERS        = ["SK 브로드밴드", "KT", "LG U+", "헬로비전", "스카이라이프"]
const PRODUCTS        = ["인터넷 단독", "인터넷+TV", "인터넷+TV+셋탑"]
const DASHBOARD_STATUSES = ["상담신청", "상담접수중", "상담완료", "보류요청"]

const STATUS_COLOR: Record<string, string> = {
  상담완료:    "bg-green-100 text-green-600",
  설치완료:    "bg-green-100 text-green-600",
  청약완료:    "bg-blue-100 text-blue-600",
  상담접수중:  "bg-yellow-100 text-yellow-700",
  해지안내완료: "bg-purple-100 text-purple-600",
  보류요청:    "bg-orange-100 text-orange-600",
  취소:        "bg-red-100 text-red-600",
}

const STATUS_SELECT_COLOR: Record<string, string> = {
  상담완료:   "bg-green-500/20 text-green-600 border-green-500/30",
  상담접수중: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  상담신청:   "bg-zinc-100 text-zinc-700 border-zinc-300",
  보류요청:   "bg-orange-500/20 text-orange-600 border-orange-500/30",
}

const DEFAULT_NEW_CUSTOMER = {
  customer_name: "",
  phone: "",
  address: "",
  carrier: "SK 브로드밴드",
  product: "인터넷 단독",
  status: "상담접수중",
}

// ─── 사이드바 라우트 ──────────────────────────────────────────────────────────

const NAV_ROUTES = [
  { path: "/",           label: "대시보드",  roles: ["admin", "manager", "cs"] },
  { path: "/customers",  label: "고객관리",  roles: ["admin", "manager", "cs"] },
  { path: "/partner",    label: "파트너",    roles: ["admin", "partner"] },
  { path: "/settlement", label: "정산관리",  roles: ["admin"] },
  { path: "/activity-logs", label: "활동로그",  roles: ["admin"] },
]

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function maskResidentNumber(residentNumber: string, status: string) {
  if (!residentNumber) return ""
  if (HIDDEN_STATUSES.includes(status)) {
    return residentNumber.replace(/^(\d{6})-(\d)\d{6}$/, "$1-$2******")
  }
  return residentNumber
}

function formatPhoneNumber(value: string) {
  const n = value.replace(/[^0-9]/g, "")
  if (n.length < 4) return n
  if (n.length < 8) return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 11)}`
}

// ─── 공통 스타일 ──────────────────────────────────────────────────────────────

const inputCls  = "w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 text-zinc-900"
const selectCls = "w-full h-14 bg-white border border-zinc-300 rounded-xl px-4 text-zinc-900"
const labelCls  = "text-zinc-500 text-sm mb-1"
const disabledInputCls = "w-full bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-3 pr-12 text-zinc-400 cursor-not-allowed"

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "bg-zinc-100 text-zinc-600"
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${color}`}>
      {status}
    </span>
  )
}

function LockedInput({ value, type = "text" }: { value: string; type?: string }) {
  return (
    <div className="relative">
      <input type={type} value={value} disabled className={disabledInputCls} />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">🔒</span>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router   = useRouter()
  const pathname = usePathname()

  const [currentUser,      setCurrentUser]      = useState<any>(null)
  const [customers,        setCustomers]        = useState<any[]>([])
  const [managers,         setManagers]         = useState<any[]>([])
  const [loading,          setLoading]          = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [newMemo,          setNewMemo]          = useState("")
  const [statusFilter,     setStatusFilter]     = useState("전체")
  const [search,           setSearch]           = useState("")
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [newCustomer,      setNewCustomer]      = useState(DEFAULT_NEW_CUSTOMER)

  // 비밀번호 변경
  const [showPwModal, setShowPwModal] = useState(false)
  const [newPw,       setNewPw]       = useState("")
  const [confirmPw,   setConfirmPw]   = useState("")
  const [pwLoading,   setPwLoading]   = useState(false)

  const newCount      = customers.filter((c) => c.status === "상담신청").length
  const progressCount = customers.filter((c) => c.status === "상담접수중").length
  const completeCount = customers.filter((c) => c.status === "상담완료").length
  const holdCount     = customers.filter((c) => c.status === "보류요청").length

  useEffect(() => { checkUser() }, [])

  // ── 인증 ──

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    const { data: userData, error } = await supabase
      .from("users").select("*").eq("id", user.id).single()

    console.log("db user:", userData, "error:", error)

    if (!userData?.is_active) {
      alert("비활성화된 계정입니다.")
      await supabase.auth.signOut()
      router.push("/login")
      return
    }

    if (userData.role === "partner") {
      alert("잘못된 접근입니다.")
      router.replace("/partner")
      return
    }

    if (
      userData.role !== "admin" &&
      userData.role !== "manager" &&
      userData.role !== "cs"
    ) {
      router.replace("/login")
      return
    }

    setCurrentUser(userData)
    await fetchManagers()
    await fetchCustomers(userData)
    setLoading(false)
  }

  // ── 데이터 fetching ──

  async function fetchManagers() {
    const { data, error } = await supabase
      .from("users").select("*").eq("role", "manager").eq("is_active", true)
    if (error) { console.error(error); return }
    setManagers(data || [])
  }

  async function fetchCustomers(userData?: any) {
    let query = supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false })

    if (
      userData?.role !== "admin" &&
      userData?.role !== "cs"
    ) {
      query = query.eq("manager_id", userData.id)
    }

    const { data, error } = await query
    if (error) { console.error(error); return }
    setCustomers(data || [])
  }

  // ── 비밀번호 변경 ──

  async function changePassword() {
    if (!newPw || !confirmPw) { alert("비밀번호를 입력해주세요."); return }
    if (newPw !== confirmPw)   { alert("비밀번호가 일치하지 않습니다."); return }
    if (newPw.length < 6)      { alert("비밀번호는 6자 이상이어야 합니다."); return }

    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwLoading(false)

    if (error) { alert("변경 실패: " + error.message); return }

    alert("비밀번호가 변경되었습니다.")
    setShowPwModal(false)
    setNewPw("")
    setConfirmPw("")
  }

  // ── 저장 ──

  async function saveMemo() {
    const { error } = await supabase
      .from("applications")
      .update({
        memo:            selectedCustomer.memo,
        customer_name:   selectedCustomer.customer_name,
        phone:           selectedCustomer.phone,
        address:         selectedCustomer.address,
        carrier:         selectedCustomer.carrier,
        product:         selectedCustomer.product,
        option:          selectedCustomer.option,
        manager:         selectedCustomer.manager,
        manager_id:      selectedCustomer.manager_id,
        status:          selectedCustomer.status,
        email:           selectedCustomer.email,
        service_number:  selectedCustomer.service_number,
        activation_date: selectedCustomer.activation_date,
        receipt_date:    selectedCustomer.receipt_date,
        bank_name:       selectedCustomer.bank_name,
        account_number:  selectedCustomer.account_number,
        account_holder:  selectedCustomer.account_holder,
        resident_number: selectedCustomer.resident_number,
        extra_note:      selectedCustomer.extra_note,
        partner_name:    selectedCustomer.partner_name,
      })
      .eq("id", selectedCustomer.id)

    if (error) { console.error(error); return }
    fetchCustomers(currentUser)
    alert("메모 저장 완료")
  }

  async function createCustomer() {
    const { error } = await supabase.from("applications").insert({
      ...newCustomer,
      manager:      currentUser?.name,
      manager_id:   currentUser?.id,
      receipt_date: new Date().toISOString().slice(0, 10),
    })
    if (error) { console.error(error); alert("고객 생성 실패"); return }

    alert("신규 고객 생성 완료")
    setShowCreateModal(false)
    setNewCustomer(DEFAULT_NEW_CUSTOMER)
    fetchCustomers(currentUser)
  }

  async function addMemoHistory() {
    if (!newMemo.trim()) return

    const now        = new Date().toLocaleString()
    const newHistory = `[${now}]\n${newMemo.trim()}\n\n${selectedCustomer.memo_history || ""}`

    const { error } = await supabase
      .from("applications").update({ memo_history: newHistory }).eq("id", selectedCustomer.id)
    if (error) { console.error(error); return }

    setSelectedCustomer((prev: any) => ({ ...prev, memo_history: newHistory }))
    setNewMemo("")
    fetchCustomers(currentUser)
  }

  // ── 헬퍼 ──

  function updateSelected(field: string, value: string) {
    setSelectedCustomer((prev: any) => ({ ...prev, [field]: value }))
  }

  function updateNewCustomer(field: string, value: string) {
    setNewCustomer((prev) => ({ ...prev, [field]: value }))
  }

  const filteredCustomers = customers.filter((c) => {
    const kw = search.toLowerCase()
    return (
      DASHBOARD_STATUSES.includes(c.status) &&
      (statusFilter === "전체" || c.status === statusFilter) &&
      (
        String(c.customer_name || "").toLowerCase().includes(kw) ||
        String(c.phone         || "").replace(/-/g, "").toLowerCase().includes(kw)
      )
    )
  })

  // ─── JSX ─────────────────────────────────────────────────────────────────

  if (loading) {
    return null
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900 flex">

      {/* 사이드바 */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white p-6">
        <h1 className="text-2xl font-bold mb-10">인터넷연구소</h1>
        <nav className="space-y-2">
          {NAV_ROUTES
            .filter(({ roles }) => roles.includes(currentUser?.role))
            .map(({ path, label }) => (
              <button
                key={path}
                type="button"
                onClick={() => router.push(path)}
                className={`w-full text-left px-4 py-3 rounded-xl transition ${
                  pathname === path
                    ? "bg-blue-50 text-blue-600 font-semibold"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <section className="flex-1 p-10 overflow-auto">

        {/* 헤더 */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">상담 업무 대시보드</h1>
            <p className="text-zinc-400">신규 접수 · 진행중 · 상담완료 고객 관리</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPwModal(true)}
              className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition text-sm"
            >
              비밀번호 변경
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {[
            { label: "신규 고객", value: newCount,      color: "text-zinc-900" },
            { label: "진행중",    value: progressCount, color: "text-yellow-400" },
            { label: "상담완료",  value: completeCount, color: "text-green-400" },
            { label: "보류",      value: holdCount,     color: "text-orange-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-zinc-200 shadow-sm hover:shadow-md transition rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-2">{label}</h2>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* 고객 테이블 */}
        <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-zinc-200">

            {/* 검색 */}
            <input
              type="text"
              placeholder="고객명 / 전화번호"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[360px] bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-4"
            />

            {/* 탭 필터 + 고객 등록 */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {[
                  { key: "전체",    count: customers.filter((c) => DASHBOARD_STATUSES.includes(c.status)).length },
                  { key: "상담신청",   count: newCount },
                  { key: "상담접수중", count: progressCount },
                  { key: "상담완료",   count: completeCount },
                  { key: "보류요청",   count: holdCount },
                ].map(({ key, count }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                      statusFilter === key
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    {key} ({count})
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition"
              >
                고객 등록
              </button>
            </div>

          </div>

          <table className="w-full">
            <thead className="bg-zinc-50 text-zinc-500 text-sm">
              <tr>
                {["고객명", "통신사", "상품", "연락처", "상태", "ref code", "추천인", "담당자"].map((h) => (
                  <th key={h} className="text-left p-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer, index) => (
                <tr
                  key={index}
                  onClick={() => setSelectedCustomer(customer)}
                  className="border-t border-zinc-200 hover:bg-zinc-50 transition cursor-pointer"
                >
                  <td className="p-4">{customer.customer_name || "고객"}</td>
                  <td className="p-4">{customer.carrier}</td>
                  <td className="p-4">{customer.product}</td>
                  <td className="p-4">{customer.phone}</td>
                  <td className="p-4"><StatusBadge status={customer.status} /></td>
                  <td className="p-4">{customer.ref_code}</td>
                  <td className="p-4">{customer.partner_name}</td>
                  <td className="p-4">{customer.manager || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </section>

      {/* 고객 상세 모달 */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="bg-white border border-zinc-200 shadow-xl rounded-3xl w-[640px] max-h-[90vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">고객 상세정보</h2>
              <button onClick={() => setSelectedCustomer(null)} className="text-zinc-500 hover:text-zinc-900 transition">
                닫기
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">

              <div>
                <p className={labelCls}>고객명</p>
                <input type="text" value={selectedCustomer.customer_name || ""} onChange={(e) => updateSelected("customer_name", e.target.value)} className={inputCls} />
              </div>

              <div>
                <p className={labelCls}>주민등록번호</p>
                <input
                  type="text"
                  value={maskResidentNumber(selectedCustomer.resident_number || "", selectedCustomer.status || "")}
                  onChange={(e) => updateSelected("resident_number", e.target.value)}
                  placeholder="900101-1******"
                  className={inputCls}
                />
              </div>

              <div>
                <p className={labelCls}>연락처</p>
                <input type="text" value={selectedCustomer.phone || ""} onChange={(e) => updateSelected("phone", e.target.value)} className={inputCls} />
              </div>

              <div>
                <p className={labelCls}>이메일</p>
                <input type="text" value={selectedCustomer.email || ""} onChange={(e) => updateSelected("email", e.target.value)} className={inputCls} />
              </div>

              <div className="col-span-2">
                <p className={labelCls}>설치주소</p>
                <input type="text" value={selectedCustomer.address || ""} onChange={(e) => updateSelected("address", e.target.value)} className={inputCls} />
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-6">
                <div>
                  <p className={labelCls}>통신사</p>
                  <select value={selectedCustomer.carrier || ""} onChange={(e) => updateSelected("carrier", e.target.value)} className={selectCls}>
                    {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelCls}>상품</p>
                  <select value={selectedCustomer.product || ""} onChange={(e) => updateSelected("product", e.target.value)} className={selectCls}>
                    {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelCls}>가입서비스번호</p>
                  <LockedInput value={selectedCustomer.service_number || ""} />
                </div>
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-6">
                <div>
                  <p className={labelCls}>예금주</p>
                  <input type="text" value={selectedCustomer.account_holder || ""} onChange={(e) => updateSelected("account_holder", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className={labelCls}>은행</p>
                  <input type="text" value={selectedCustomer.bank_name || ""} onChange={(e) => updateSelected("bank_name", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className={labelCls}>계좌번호</p>
                  <input type="text" value={selectedCustomer.account_number || ""} onChange={(e) => updateSelected("account_number", e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-6">
                <div>
                  <p className={labelCls}>접수일자</p>
                  <input type="date" value={selectedCustomer.receipt_date || ""} onChange={(e) => updateSelected("receipt_date", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className={labelCls}>개통일자</p>
                  <LockedInput value={selectedCustomer.activation_date || ""} type="date" />
                </div>
              </div>

              <div className="col-span-2">
                <p className={labelCls}>추가 내용</p>
                <textarea
                  value={selectedCustomer.extra_note || ""}
                  onChange={(e) => updateSelected("extra_note", e.target.value)}
                  className="w-full h-40 bg-white border border-zinc-300 rounded-xl p-4 text-zinc-900 resize-none"
                  placeholder="설치비 / 월요금 / 특이사항 / 기사 요청사항 등"
                />
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-6">
                <div>
                  <p className={labelCls}>담당자</p>
                  <select
                    value={selectedCustomer.manager || ""}
                    onChange={(e) => {
                      const found = managers.find((m) => m.name === e.target.value)
                      setSelectedCustomer((prev: any) => ({
                        ...prev,
                        manager:    e.target.value,
                        manager_id: found?.id || "",
                      }))
                    }}
                    className={selectCls}
                  >
                    <option value="">미배정</option>
                    {managers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>

                <div>
                  <p className={labelCls}>추천인</p>
                  <input
                    type="text"
                    value={selectedCustomer.partner_name || ""}
                    onChange={(e) => updateSelected("partner_name", e.target.value)}
                    placeholder="추천인 입력"
                    className={inputCls}
                  />
                </div>

                <div>
                  <p className={labelCls}>상태</p>
                  <select
                    value={selectedCustomer.status || ""}
                    onChange={(e) => updateSelected("status", e.target.value)}
                    className={`w-full h-14 border rounded-xl px-4 ${STATUS_SELECT_COLOR[selectedCustomer.status] ?? "bg-white text-zinc-900 border-zinc-300"}`}
                  >
                    {DASHBOARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="col-span-2 flex justify-end">
                <button onClick={saveMemo} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition">
                  수정 완료
                </button>
              </div>

              <div className="col-span-2">
                <p className={labelCls}>상담 히스토리</p>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 whitespace-pre-line text-sm leading-5 text-zinc-700 max-h-24 overflow-y-auto">
                  {selectedCustomer.memo_history || "상담 기록 없음"}
                </div>
              </div>

              <div className="col-span-2">
                <p className={labelCls}>상담 메모</p>
                <textarea
                  value={newMemo}
                  onChange={(e) => setNewMemo(e.target.value)}
                  className="w-full h-24 bg-white border border-zinc-300 rounded-xl p-4 text-zinc-900 resize-none"
                  placeholder="상담 메모를 입력하세요"
                />
              </div>

              <div className="col-span-2 flex justify-end">
                <button onClick={addMemoHistory} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition">
                  상담 메모 추가
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 신규 고객 생성 모달 */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-3xl w-[520px] p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">고객 등록</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-900 transition">
                닫기
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="고객명"
                value={newCustomer.customer_name}
                onChange={(e) => updateNewCustomer("customer_name", e.target.value)}
                className={inputCls}
              />
              <input
                type="text"
                placeholder="연락처"
                value={newCustomer.phone}
                onChange={(e) => updateNewCustomer("phone", formatPhoneNumber(e.target.value))}
                className={inputCls}
              />
              <input
                type="text"
                placeholder="설치주소"
                value={newCustomer.address}
                onChange={(e) => updateNewCustomer("address", e.target.value)}
                className={inputCls}
              />
              <select value={newCustomer.carrier} onChange={(e) => updateNewCustomer("carrier", e.target.value)} className={selectCls}>
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newCustomer.product} onChange={(e) => updateNewCustomer("product", e.target.value)} className={selectCls}>
                {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={createCustomer} className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition">
                고객 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {showPwModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => { setShowPwModal(false); setNewPw(""); setConfirmPw("") }}
        >
          <div
            className="bg-white rounded-3xl w-[400px] p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">비밀번호 변경</h2>
              <button onClick={() => { setShowPwModal(false); setNewPw(""); setConfirmPw("") }}
                className="text-zinc-500 hover:text-zinc-900 transition">
                닫기
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className={labelCls}>새 비밀번호</p>
                <input
                  type="password"
                  placeholder="6자 이상 입력"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <p className={labelCls}>새 비밀번호 확인</p>
                <input
                  type="password"
                  placeholder="비밀번호 재입력"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className={inputCls}
                />
              </div>
              {newPw && confirmPw && newPw !== confirmPw && (
                <p className="text-red-500 text-sm">비밀번호가 일치하지 않습니다.</p>
              )}
              <button
                onClick={changePassword}
                disabled={pwLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
              >
                {pwLoading ? "변경 중..." : "변경하기"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}