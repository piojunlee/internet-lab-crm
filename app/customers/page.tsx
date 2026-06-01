"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

// ─── 상수 ────────────────────────────────────────────────────────────────────

const HIDDEN_STATUSES          = ["청약완료", "설치완료", "해지안내완료", "보류요청", "취소"]
const CUSTOMER_MANAGE_STATUSES = ["상담완료", "청약완료", "설치완료", "해지안내완료", "보류요청", "취소"]
const CARRIERS     = ["SK 브로드밴드", "KT", "LG U+", "헬로비전", "스카이라이프"]
const PRODUCTS     = ["인터넷 단독", "인터넷+TV", "인터넷+TV+셋탑"]
const STATUSES     = ["상담신청", "상담접수중", "상담완료", "청약완료", "설치완료", "해지안내완료", "보류요청", "취소"]
const PERIOD_OPTIONS = ["전체", "오늘", "어제", "이번달", "지난달"]

// 로그 남길 필드 목록 (field key → 표시 이름)
const LOG_FIELDS: Record<string, string> = {
  status:          "상태",
  manager:         "담당자",
  carrier:         "통신사",
  product:         "상품",
  phone:           "연락처",
  address:         "설치주소",
  service_number:  "가입서비스번호",
  activation_date: "개통일자",
  receipt_date:    "접수일자",
  extra_note:      "추가내용",
}

const DEFAULT_NEW_CUSTOMER = {
  customer_name: "",
  phone:    "",
  address:  "",
  carrier:  "SK 브로드밴드",
  product:  "인터넷 단독",
  status:   "상담접수중",
}

const STATUS_COLOR: Record<string, string> = {
  상담완료:    "bg-yellow-100 text-yellow-700",
  설치완료:    "bg-green-100 text-green-600",
  청약완료:    "bg-blue-100 text-blue-600",
  상담접수중:  "bg-yellow-100 text-yellow-700",
  해지안내완료: "bg-purple-100 text-purple-600",
  보류요청:    "bg-orange-100 text-orange-600",
  취소:        "bg-red-100 text-red-600",
}

const STATUS_SELECT_COLOR: Record<string, string> = {
  설치완료:   "bg-green-500/20 text-green-400 border-green-500/30",
  청약완료:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  상담접수중: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  취소:       "bg-red-500/20 text-red-400 border-red-500/30",
}

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

function toDateStr(date: Date) { return date.toISOString().slice(0, 10) }
function toMonthStr(date: Date) { return date.toISOString().slice(0, 7) }

// ─── 공통 스타일 ──────────────────────────────────────────────────────────────

const inputCls        = "w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 text-zinc-900"
const selectCls       = "w-full h-14 bg-white border border-zinc-300 rounded-xl px-4 text-zinc-900"
const labelCls        = "text-zinc-500 text-sm mb-1"
const filterSelectCls = "bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900"

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "bg-zinc-100 text-zinc-600"
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${color}`}>
      {status}
    </span>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function CustomerManagePage() {
  const router = useRouter()
  const [currentUser,      setCurrentUser]      = useState<any>(null)
  const [customers,        setCustomers]        = useState<any[]>([])
  const [managers,         setManagers]         = useState<any[]>([])
  const [loading,          setLoading]          = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [originalCustomer, setOriginalCustomer] = useState<any>(null)   // 원본 스냅샷
  const [newMemo,          setNewMemo]          = useState("")
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [newCustomer,      setNewCustomer]      = useState(DEFAULT_NEW_CUSTOMER)

  const [search,        setSearch]        = useState("")
  const [managerFilter, setManagerFilter] = useState("전체")
  const [carrierFilter, setCarrierFilter] = useState("전체")
  const [productFilter, setProductFilter] = useState("전체")
  const [statusFilter,  setStatusFilter]  = useState("전체")
  const [dateType,      setDateType]      = useState<"receipt_date" | "activation_date">("receipt_date")
  const [periodFilter,  setPeriodFilter]  = useState("전체")
  const [startDate,     setStartDate]     = useState("")
  const [endDate,       setEndDate]       = useState("")

  useEffect(() => { checkUser() }, [])

  // ── 인증 ──

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    const { data: userData } = await supabase
      .from("users").select("*").eq("id", user.id).single()

    if (!userData?.is_active) { router.push("/login"); return }

    if (userData.role === "partner") {
        alert("잘못된 접근입니다.")
        router.replace("/partner")
        return
      }

      if (!["admin", "manager", "cs"].includes(userData.role)) {
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
      .from("applications").select("*").order("created_at", { ascending: false })
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

  // ── 고객 선택 (원본 스냅샷 저장) ──

  function openCustomer(customer: any) {
    setSelectedCustomer({ ...customer })   // 독립 복사본
    setOriginalCustomer({ ...customer })   // 독립 복사본 (참조 분리)
  }

  // ── 저장 ──

  async function createCustomer() {
    const { error } = await supabase.from("applications").insert({
      customer_name: newCustomer.customer_name,
      phone:         newCustomer.phone,
      address:       newCustomer.address,
      carrier:       newCustomer.carrier,
      product:       newCustomer.product,
      status:        "상담접수중",
      receipt_date:  new Date().toISOString().slice(0, 10),
      manager:    currentUser?.role === "manager" ? currentUser.name : null,
      manager_id: currentUser?.role === "manager" ? currentUser.id   : null,
    })
    if (error) { console.error(error); alert("고객 생성 실패"); return }

    alert("고객 생성 완료")
    setShowCreateModal(false)
    setNewCustomer(DEFAULT_NEW_CUSTOMER)
    fetchCustomers(currentUser)
  }

  async function saveCustomer() {
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
        ref_code:        selectedCustomer.ref_code,
      })
      .eq("id", selectedCustomer.id)

    if (error) { console.error(error); return }

    // ── 변경된 필드 로그 기록 ──
    if (originalCustomer) {
      const logs = Object.entries(LOG_FIELDS)
        .filter(([field]) => {
          const oldVal = originalCustomer[field] ?? ""
          const newVal = selectedCustomer[field]  ?? ""
          return String(oldVal) !== String(newVal)
        })
        .map(([field, label]) => ({
          application_id: selectedCustomer.id,
          customer_name:  selectedCustomer.customer_name,
          user_id:        currentUser.id,
          user_name:      currentUser.name,
          action:         label + " 변경",
          old_value:      String(originalCustomer[field] ?? ""),
          new_value:      String(selectedCustomer[field]  ?? ""),
        }))

      if (logs.length > 0) {
        const { error: logError } = await supabase.from("activity_logs").insert(logs)
        if (logError) console.error("로그 저장 실패:", logError)
      }
    }

    fetchCustomers(currentUser)
    alert("수정 완료")
    setOriginalCustomer({ ...selectedCustomer })  // 저장 후 원본 갱신 (독립 복사본)
  }

  async function addMemoHistory() {
    if (!newMemo.trim()) return

    const now        = new Date().toLocaleString()
    const newHistory = `[${now}]\n${newMemo.trim()}\n\n${selectedCustomer.memo_history || ""}`

    const { error } = await supabase
      .from("applications").update({ memo_history: newHistory }).eq("id", selectedCustomer.id)
    if (error) { console.error(error); return }

    // 상담 메모 로그
    await supabase.from("activity_logs").insert({
      application_id: selectedCustomer.id,
      customer_name:  selectedCustomer.customer_name,
      user_id:        currentUser.id,
      user_name:      currentUser.name,
      action:         "상담메모 추가",
      old_value:      "",
      new_value:      newMemo.trim(),
    })

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
    const today     = new Date()
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const lastMonth = new Date(today); lastMonth.setMonth(today.getMonth() - 1)

    const target = c[dateType] || ""
    const kw     = search.toLowerCase()

    const periodMatch =
      periodFilter === "전체"   ? (!startDate || target >= startDate) && (!endDate || target <= endDate) :
      periodFilter === "오늘"   ? target === toDateStr(today) :
      periodFilter === "어제"   ? target === toDateStr(yesterday) :
      periodFilter === "이번달" ? target.startsWith(toMonthStr(today)) :
      periodFilter === "지난달" ? target.startsWith(toMonthStr(lastMonth)) :
      true

    return (
      CUSTOMER_MANAGE_STATUSES.includes(c.status) &&
      (managerFilter === "전체" || c.manager === managerFilter) &&
      (carrierFilter === "전체" || c.carrier === carrierFilter) &&
      (productFilter === "전체" || c.product === productFilter) &&
      (statusFilter  === "전체" || c.status  === statusFilter) &&
      periodMatch &&
      (
        String(c.customer_name  || "").toLowerCase().includes(kw) ||
        String(c.phone          || "").replace(/-/g, "").toLowerCase().includes(kw) ||
        String(c.ref_code       || "").toLowerCase().includes(kw) ||
        String(c.carrier        || "").toLowerCase().includes(kw) ||
        String(c.partner_name   || "").toLowerCase().includes(kw) ||
        String(c.service_number || "").toLowerCase().includes(kw) ||
        String(c.address        || "").toLowerCase().includes(kw) ||
        String(c.manager        || "").toLowerCase().includes(kw)
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
          {["admin", "manager", "cs"].includes(currentUser?.role) && (
            <button type="button" onClick={() => router.push("/")}
              className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
              대시보드
            </button>
          )}
          <button type="button"
            className="w-full text-left px-4 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold">
            고객관리
          </button>
          {currentUser?.role === "admin" && (
            <>
              <button type="button" onClick={() => router.push("/partner")}
                className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
                파트너
              </button>
              <button type="button" onClick={() => router.push("/settlement")}
                className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
                정산관리
              </button>
              <button type="button" onClick={() => router.push("/activity-logs")}
                className="w-full text-left px-4 py-3 rounded-xl text-zinc-700 hover:bg-zinc-100 transition">
                활동로그
              </button>
            </>
          )}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <section className="flex-1 p-10 overflow-auto">

        {/* 헤더 */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">가입 고객 관리</h1>
            <p className="text-zinc-400">Joshua 1:9</p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            className="bg-white border border-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-100 transition"
          >
            로그아웃
          </button>
        </div>

        {/* 현황판 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "상담완료", value: customers.filter((c) => c.status === "상담완료").length, color: "text-yellow-500" },
            { label: "청약완료", value: customers.filter((c) => c.status === "청약완료").length, color: "text-blue-500" },
            { label: "설치완료", value: customers.filter((c) => c.status === "설치완료").length, color: "text-green-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-zinc-200 shadow-sm hover:shadow-md transition rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-2 text-zinc-700">{label}</h2>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl overflow-hidden">

          {/* 필터 영역 */}
          <div className="p-6 border-b border-zinc-200">

            <input
              type="text"
              placeholder="고객명 / 전화번호 / 서비스번호 / 주소 / 담당자 / ref code / 추천인 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[360px] bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-100 mb-4"
            />

            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                {[
                  { key: "전체",    count: customers.filter((c) => CUSTOMER_MANAGE_STATUSES.includes(c.status)).length },
                  { key: "상담완료", count: customers.filter((c) => c.status === "상담완료").length },
                  { key: "청약완료", count: customers.filter((c) => c.status === "청약완료").length },
                  { key: "설치완료", count: customers.filter((c) => c.status === "설치완료").length },
                ].map(({ key, count }) => (
                  <button key={key} onClick={() => setStatusFilter(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                      statusFilter === key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}>
                    {key} ({count})
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-blue-700 transition">
                고객 등록
              </button>
            </div>

            <div className="flex items-center gap-3">
              <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className={filterSelectCls}>
                <option value="전체">전체 담당자</option>
                {managers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className={filterSelectCls}>
                <option value="전체">전체 통신사</option>
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className={filterSelectCls}>
                <option value="전체">전체 상품</option>
                {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterSelectCls}>
                <option value="전체">전체 상태</option>
                {CUSTOMER_MANAGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-3">
                <select value={dateType}
                  onChange={(e) => setDateType(e.target.value as "receipt_date" | "activation_date")}
                  className={filterSelectCls}>
                  <option value="receipt_date">접수일자</option>
                  <option value="activation_date">개통일자</option>
                </select>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  disabled={periodFilter !== "전체"}
                  className="bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <span className="text-zinc-400">~</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  disabled={periodFilter !== "전체"}
                  className="bg-white border border-zinc-300 rounded-xl px-4 py-2 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className={filterSelectCls}>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p === "전체" ? "전체 기간" : p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 테이블 */}
          <table className="w-full">
            <thead className="bg-zinc-50 text-zinc-500 text-sm">
              <tr>
                {["고객명", "연락처", "통신사", "상품", "상태", "담당자", "추천인", "REF", "접수일자", "개통일자", "가입서비스번호"].map((h) => (
                  <th key={h} className="text-left p-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} onClick={() => openCustomer(customer)}
                  className="border-t border-zinc-200 hover:bg-zinc-50 transition cursor-pointer">
                  <td className="p-4">{customer.customer_name || "고객"}</td>
                  <td className="p-4">{customer.phone}</td>
                  <td className="p-4">{customer.carrier}</td>
                  <td className="p-4">{customer.product}</td>
                  <td className="p-4"><StatusBadge status={customer.status} /></td>
                  <td className="p-4">{customer.manager       || "-"}</td>
                  <td className="p-4">{customer.partner_name  || "-"}</td>
                  <td className="p-4">{customer.ref_code      || "-"}</td>
                  <td className="p-4">{customer.receipt_date    || "-"}</td>
                  <td className="p-4">{customer.activation_date || "-"}</td>
                  <td className="p-4">{customer.service_number  || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 고객 상세 모달 */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-zinc-200 shadow-xl rounded-3xl w-[640px] max-h-[90vh] overflow-y-auto p-8">

            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">고객 상세정보</h2>
              <button onClick={() => { setSelectedCustomer(null); setOriginalCustomer(null) }}
                className="text-zinc-500 hover:text-zinc-900 transition">
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
                <input type="text"
                  value={maskResidentNumber(selectedCustomer.resident_number || "", selectedCustomer.status || "")}
                  onChange={(e) => updateSelected("resident_number", e.target.value)}
                  placeholder="900101-1******" className={inputCls} />
              </div>

              <div>
                <p className={labelCls}>연락처</p>
                <input type="text" value={selectedCustomer.phone || ""} onChange={(e) => updateSelected("phone", formatPhoneNumber(e.target.value))} className={inputCls} />
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
                  <input type="text" value={selectedCustomer.service_number || ""} onChange={(e) => updateSelected("service_number", e.target.value)} className={inputCls} />
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
                  <input type="date" value={selectedCustomer.activation_date || ""} onChange={(e) => updateSelected("activation_date", e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="col-span-2">
                <p className={labelCls}>추가 내용</p>
                <textarea value={selectedCustomer.extra_note || ""} onChange={(e) => updateSelected("extra_note", e.target.value)}
                  className="w-full h-40 bg-white border border-zinc-300 rounded-xl p-4 text-zinc-900 resize-none"
                  placeholder="설치비 / 월요금 / 특이사항 / 기사 요청사항 등" />
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-6">
                <div>
                  <p className={labelCls}>담당자</p>
                  <select value={selectedCustomer.manager || ""}
                    onChange={(e) => {
                      const found = managers.find((m) => m.name === e.target.value)
                      setSelectedCustomer((prev: any) => ({
                        ...prev, manager: e.target.value, manager_id: found?.id || "",
                      }))
                    }}
                    className={selectCls}>
                    <option value="">미배정</option>
                    {managers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelCls}>추천인 (REF)</p>
                  <input
                    type="text"
                    value={selectedCustomer.ref_code || ""}
                    onChange={(e) => updateSelected("ref_code", e.target.value)}
                    placeholder="REF 코드 입력"
                    className={inputCls}
                  />
                </div>
                <div>
                  <p className={labelCls}>상태</p>
                  <select value={selectedCustomer.status || ""} onChange={(e) => updateSelected("status", e.target.value)}
                    className={`w-full h-14 border rounded-xl px-4 ${STATUS_SELECT_COLOR[selectedCustomer.status] ?? "bg-white text-zinc-900 border-zinc-300"}`}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="col-span-2 flex justify-end">
                <button onClick={saveCustomer} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition">
                  수정 완료
                </button>
              </div>

              {/* 상담 히스토리 */}
              <div className="col-span-2">
                <p className={labelCls}>상담 히스토리</p>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 whitespace-pre-line text-sm leading-5 text-zinc-700 max-h-24 overflow-y-auto">
                  {selectedCustomer.memo_history || "상담 기록 없음"}
                </div>
              </div>

              {/* 상담 메모 */}
              <div className="col-span-2">
                <p className={labelCls}>상담 메모</p>
                <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)}
                  className="w-full h-24 bg-white border border-zinc-300 rounded-xl p-4 text-zinc-900 resize-none"
                  placeholder="상담 메모를 입력하세요" />
              </div>

              <div className="col-span-2 flex justify-end">
                <button onClick={addMemoHistory} className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-zinc-700 transition">
                  상담 메모 추가
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 신규 고객 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl w-[520px] p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">고객 등록</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-900 transition">
                닫기
              </button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="고객명" value={newCustomer.customer_name}
                onChange={(e) => updateNewCustomer("customer_name", e.target.value)} className={inputCls} />
              <input type="text" placeholder="연락처" value={newCustomer.phone}
                onChange={(e) => updateNewCustomer("phone", formatPhoneNumber(e.target.value))} className={inputCls} />
              <input type="text" placeholder="설치주소" value={newCustomer.address}
                onChange={(e) => updateNewCustomer("address", e.target.value)} className={inputCls} />
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

    </main>
  )
}