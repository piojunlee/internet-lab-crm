"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const CARRIERS = ["SK 브로드밴드", "KT", "LG U+", "헬로비전", "스카이라이프"]
const PRODUCTS = ["인터넷 단독", "인터넷+TV",]

// 상품별 정산금액
function getCommission(product: string): number {
  if (product === "인터넷 단독") return 30000
  return 50000  // 인터넷+TV, 인터넷+TV+셋탑
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    상담완료:    "bg-yellow-100 text-yellow-700",
    설치완료:    "bg-green-100 text-green-600",
    청약완료:    "bg-blue-100 text-blue-600",
    상담접수중:  "bg-yellow-100 text-yellow-700",
    상담신청:    "bg-zinc-100 text-zinc-600",
    해지안내완료: "bg-purple-100 text-purple-600",
    보류요청:    "bg-orange-100 text-orange-600",
    취소:        "bg-red-100 text-red-600",
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colorMap[status] || "bg-zinc-100 text-zinc-600"}`}>
      {status}
    </span>
  )
}

const inputCls = "w-full border border-zinc-200 rounded-2xl px-4 py-3.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"

function formatPhone(value: string) {
  const n = value.replace(/[^0-9]/g, "")
  if (n.length < 4)  return n
  if (n.length < 8)  return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 11)}`
}

export default function PartnerPage() {
  const router = useRouter()

  const [currentUser,      setCurrentUser]      = useState<any>(null)
  const [customers,        setCustomers]        = useState<any[]>([])
  const [search,           setSearch]           = useState("")
  const [settlementFilter, setSettlementFilter] = useState("전체")
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [newCustomer,      setNewCustomer]      = useState({
    customer_name: "",
    phone:   "",
    address: "",
    carrier: "SK 브로드밴드",
    product: "인터넷 단독",
  })
  const [dateType,      setDateType]      = useState("receipt_date")
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [kpiMonth,      setKpiMonth]      = useState(() => new Date().toISOString().slice(0, 7))
  const [showBankInfo,  setShowBankInfo]  = useState(false)
  const [showFabTooltip, setShowFabTooltip] = useState(false)

  // 비밀번호 변경
  const [showPwModal, setShowPwModal] = useState(false)
  const [newPw,       setNewPw]       = useState("")
  const [confirmPw,   setConfirmPw]   = useState("")
  const [pwLoading,   setPwLoading]   = useState(false)

  useEffect(() => {
    checkUser()
    setShowFabTooltip(true)
    const timer = setTimeout(() => setShowFabTooltip(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    const { data: userData } = await supabase
      .from("users").select("*").eq("id", user.id).single()

    if (!userData) { router.push("/login"); return }

    if (userData.role !== "partner" && userData.role !== "admin") {
      router.push("/")
      return
    }

    setCurrentUser(userData)
    fetchCustomers(userData.ref_code)
  }

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

  async function createCustomer() {
    const { error } = await supabase.from("applications").insert({
      customer_name: newCustomer.customer_name,
      phone:         newCustomer.phone,
      address:       newCustomer.address,
      carrier:       newCustomer.carrier,
      product:       newCustomer.product,
      status:        "상담신청",
      partner_id:    currentUser.id,
      partner_name:  currentUser.name,
      ref_code:      currentUser.ref_code,
      receipt_date:  new Date().toISOString().slice(0, 10),
      settlement_status: "정산대기",
      commission_amount: 0,
    })
    if (error) { console.error(error); alert("고객 등록 실패"); return }
    alert("고객 등록 완료")
    setShowCreateModal(false)
    fetchCustomers(currentUser.ref_code)
  }

  async function fetchCustomers(refCode: string) {
    const { data, error } = await supabase
      .from("applications").select("*").eq("ref_code", refCode)
      .order("created_at", { ascending: false })
    if (error) { console.error(error); return }
    setCustomers(data || [])
  }

  const filteredCustomers = customers.filter((c) => {
    const keyword    = search.toLowerCase()
    const targetDate = c[dateType] || c.created_at?.slice(0, 10) || ""
    const monthMatch = !selectedMonth || targetDate.startsWith(selectedMonth)
    return (
      monthMatch &&
      (settlementFilter === "전체" || c.settlement_status === settlementFilter) &&
      (
        String(c.customer_name || "").toLowerCase().includes(keyword) ||
        String(c.phone         || "").replace(/-/g, "").includes(keyword)
      )
    )
  })

  const receiptCount  = customers.length
  const installCount  = customers.filter((c) => c.status === "설치완료").length

  const kpiPending = customers
    .filter((c) =>
      c.status === "설치완료" &&
      c.settlement_status !== "정산완료" &&
      (!kpiMonth || (c.activation_date || "").startsWith(kpiMonth))
    )
    .reduce((sum, c) => sum + getCommission(c.product), 0)

  const kpiDone = customers
    .filter((c) =>
      c.settlement_status === "정산완료" &&
      (!kpiMonth || (c.settlement_date || c.activation_date || "").startsWith(kpiMonth))
    )
    .reduce((sum, c) => sum + getCommission(c.product), 0)

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl text-blue-600 font-bold">PARTNER</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowPwModal(true)}
              className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2.5 rounded-xl text-sm active:opacity-80">
              비밀번호
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
              className="bg-zinc-800 text-white px-4 py-2.5 rounded-xl text-sm active:opacity-80">
              로그아웃
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-zinc-400 text-xs font-medium mb-1">접수건</p>
            <p className="text-3xl font-bold text-blue-500">{receiptCount}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-zinc-400 text-xs font-medium mb-1">개통건</p>
            <p className="text-3xl font-bold text-green-500">{installCount}</p>
          </div>
          {/* 월별 정산 카드 */}
          <div className="col-span-2 bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-400 text-xs font-medium">월별 정산</p>
              <input
                type="month"
                value={kpiMonth}
                onChange={(e) => setKpiMonth(e.target.value)}
                className="border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-2xl px-4 py-3">
                <p className="text-amber-500 text-xs font-medium mb-1">정산예정금액</p>
                <p className="text-2xl font-bold text-amber-500">{kpiPending.toLocaleString()}원</p>
              </div>
              <div className="bg-green-50 rounded-2xl px-4 py-3">
                <p className="text-green-600 text-xs font-medium mb-1">정산완료금액</p>
                <p className="text-2xl font-bold text-green-600">{kpiDone.toLocaleString()}원</p>
              </div>
            </div>
          </div>
        </div>

        {/* 추천 링크 */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
          <p className="text-xs text-zinc-400 font-medium mb-2">파트너님 추천 링크</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-600 truncate">
              https://intlab.kr?ref={currentUser?.ref_code}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://intlab.kr?ref=${currentUser?.ref_code}`)
                alert("추천 링크가 복사되었습니다.")
              }}
              className="shrink-0 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium active:opacity-80"
            >
              복사
            </button>
          </div>
        </div>

        {/* 계좌 */}
        <div
          className="bg-white rounded-2xl p-4 mb-4 shadow-sm cursor-pointer select-none active:bg-zinc-50"
          onClick={() => setShowBankInfo((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400 font-medium">정산 계좌</p>
            <span className="text-xs text-zinc-400">{showBankInfo ? "숨기기 ▲" : "보기 ▼"}</span>
          </div>
          {showBankInfo ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400 mb-1">예금주</p>
                <p className="text-sm font-semibold">{currentUser?.account_holder}</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400 mb-1">은행</p>
                <p className="text-sm font-semibold">{currentUser?.bank_name}</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-xs text-zinc-400 mb-1">계좌번호</p>
                <p className="text-sm font-semibold">{currentUser?.bank_account}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-zinc-400 text-xs">탭하면 계좌 정보를 확인할 수 있습니다</p>
          )}
        </div>

        {/* 필터 — 한 줄 */}
        <div className="bg-white rounded-2xl p-3 mb-4 shadow-sm flex items-center gap-2">
          <input
            type="text"
            placeholder="고객명 / 연락처"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-[110px] shrink-0 border border-zinc-200 rounded-xl px-2 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={settlementFilter}
            onChange={(e) => setSettlementFilter(e.target.value)}
            className="w-[80px] shrink-0 border border-zinc-200 rounded-xl px-2 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="전체">전체</option>
            <option value="정산대기">정산대기</option>
            <option value="정산완료">정산완료</option>
          </select>
        </div>

        {/* 고객 목록 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm">고객 목록</h2>
            <span className="text-xs text-zinc-400">{filteredCustomers.length}건</span>
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="text-center text-zinc-400 text-sm py-12">등록된 고객이 없습니다</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className="w-full text-left px-4 py-4 hover:bg-zinc-50 active:bg-zinc-100 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-base text-zinc-900">
                        {c.customer_name || "-"}
                      </p>
                      <p className="text-sm text-zinc-400 mt-0.5">{c.phone || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-zinc-300 text-sm">›</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 플로팅 고객 등록 버튼 */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {showFabTooltip && (
          <div className="relative bg-zinc-800 text-white text-sm px-3 py-2 rounded-xl shadow-lg whitespace-nowrap animate-fade-in">
            고객 등록
            {/* 말풍선 꼬리 */}
            <span className="absolute -bottom-1.5 right-5 w-3 h-3 bg-zinc-800 rotate-45" />
          </div>
        )}
        <button
          onClick={() => {
            setShowFabTooltip(false)
            setShowCreateModal(true)
          }}
          className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg text-2xl flex items-center justify-center active:opacity-80"
        >
          +
        </button>
      </div>

      {/* 고객 상세 바텀시트 */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedCustomer(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-xl">
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xl font-bold">{selectedCustomer.customer_name || "-"}</p>
                <p className="text-sm text-zinc-400 mt-0.5">{selectedCustomer.phone || "-"}</p>
              </div>
              <StatusBadge status={selectedCustomer.status} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "통신사",   value: selectedCustomer.carrier },
                { label: "상품",     value: selectedCustomer.product },
                { label: "접수일자", value: selectedCustomer.receipt_date    || "-" },
                { label: "개통일자", value: selectedCustomer.activation_date || "-" },
                {
                  label: "정산금액",
                  value: selectedCustomer.settlement_status === "정산완료"
                    ? `${(selectedCustomer.commission_amount || getCommission(selectedCustomer.product)).toLocaleString()}원`
                    : selectedCustomer.status === "설치완료"
                      ? `${getCommission(selectedCustomer.product).toLocaleString()}원 (예정)`
                      : "-",
                },
                { label: "정산상태", value: selectedCustomer.settlement_status || "정산대기" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-zinc-50 rounded-2xl px-4 py-3">
                  <p className="text-xs text-zinc-400 mb-1">{label}</p>
                  <p className={`text-sm font-semibold ${
                    label === "정산상태" && value === "정산완료" ? "text-green-600" :
                    label === "정산상태" && value === "정산대기" ? "text-amber-500" :
                    "text-zinc-900"
                  }`}>{value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              className="mt-5 w-full bg-zinc-100 text-zinc-600 py-3.5 rounded-2xl text-sm font-medium active:opacity-80"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 고객 등록 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-xl">
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-5" />
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold">고객 등록</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-400 text-sm">닫기</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="고객명" value={newCustomer.customer_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, customer_name: e.target.value })}
                className={inputCls}
              />
              <input type="tel" placeholder="연락처 (010-0000-0000)" value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: formatPhone(e.target.value) })}
                className={inputCls}
                maxLength={13}
              />
              <input type="text" placeholder="설치주소" value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                className={inputCls}
              />
              <select value={newCustomer.carrier}
                onChange={(e) => setNewCustomer({ ...newCustomer, carrier: e.target.value })}
                className={inputCls}
              >
                {CARRIERS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={newCustomer.product}
                onChange={(e) => setNewCustomer({ ...newCustomer, product: e.target.value })}
                className={inputCls}
              >
                {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
              </select>
              <button onClick={createCustomer}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl text-base font-semibold active:opacity-80">
                고객 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50"
            onClick={() => { setShowPwModal(false); setNewPw(""); setConfirmPw("") }} />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-xl">
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-5" />
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold">비밀번호 변경</h2>
              <button onClick={() => { setShowPwModal(false); setNewPw(""); setConfirmPw("") }}
                className="text-zinc-400 text-sm">닫기</button>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="새 비밀번호 (6자 이상)"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={inputCls}
              />
              <input
                type="password"
                placeholder="새 비밀번호 확인"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={inputCls}
              />
              {newPw && confirmPw && newPw !== confirmPw && (
                <p className="text-red-500 text-sm px-1">비밀번호가 일치하지 않습니다.</p>
              )}
              <button
                onClick={changePassword}
                disabled={pwLoading}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl text-base font-semibold active:opacity-80 disabled:opacity-50"
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