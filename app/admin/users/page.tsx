"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const ROLES = ["manager", "cs", "partner", "admin"]
const PARTNER_BASE_URL = "https://www.intlab.kr/"

async function callApi(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

const fieldCls = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"

interface ManageButtonsProps {
  user: any
  onDelete:        (id: string) => void
  onToggleStatus:  (id: string, active: boolean) => void
  onResetPassword: (id: string) => void
}

function ManageButtons({ user, onDelete, onToggleStatus, onResetPassword }: ManageButtonsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {user.role !== "admin" && (
        <>
          <button onClick={() => onDelete(user.id)}
            className="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/30 transition">
            삭제
          </button>
          <button onClick={() => onToggleStatus(user.id, user.is_active)}
            className="bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition">
            {user.is_active ? "비활성화" : "활성화"}
          </button>
        </>
      )}
      <button onClick={() => onResetPassword(user.id)}
        className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition">
        비밀번호 초기화
      </button>
    </div>
  )
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [loading,      setLoading]      = useState(true)
  const [catPos,       setCatPos]       = useState({ x: 60, y: 60 })
  const [flipped,      setFlipped]      = useState(false)
  const catVel = useRef({ vx: 2.2, vy: 1.6 })
  const [users,        setUsers]        = useState<any[]>([])
  const [editingUser,  setEditingUser]  = useState<any>(null)
  const [activeTab,    setActiveTab]    = useState<"internal" | "partner">("internal")
  const [name,          setName]          = useState("")
  const [email,         setEmail]         = useState("")
  const [password,      setPassword]      = useState("")
  const [role,          setRole]          = useState("manager")
  const [refCode,       setRefCode]       = useState("")
  const [phone,         setPhone]         = useState("")
  const [bankName,      setBankName]      = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountHolder, setAccountHolder] = useState("")

  useEffect(() => { checkAdmin() }, [])

  useEffect(() => {
    const SIZE = 260
    const interval = setInterval(() => {
      setCatPos((prev) => {
        const maxX = window.innerWidth  - SIZE
        const maxY = window.innerHeight - SIZE
        let { vx, vy } = catVel.current
        let nx = prev.x + vx
        let ny = prev.y + vy
        if (nx <= 0 || nx >= maxX) { vx = -vx; nx = Math.max(0, Math.min(nx, maxX)) }
        if (ny <= 0 || ny >= maxY) { vy = -vy; ny = Math.max(0, Math.min(ny, maxY)) }
        catVel.current = { vx, vy }
        setFlipped(vx < 0)
        return { x: nx, y: ny }
      })
    }, 16)
    return () => clearInterval(interval)
  }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }
    const { data: userData } = await supabase
      .from("users").select("*").eq("id", user.id).single()
    if (!userData || userData.role !== "admin") { router.push("/"); return }
    await fetchUsers()
    setLoading(false)
  }

  async function fetchUsers() {
    const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false })
    if (error) { console.error(error); return }
    setUsers(data || [])
  }

  async function createUser() {
    if (role === "partner") {
      if (!phone || !refCode || !bankName || !accountNumber || !accountHolder) {
        alert("파트너 생성 시 휴대폰, REF 코드, 은행명, 계좌번호, 예금주는 필수입니다.")
        return
      }
    }
    if (role === "partner" && refCode.trim()) {
      const { data: existing } = await supabase
        .from("users").select("id").eq("ref_code", refCode.trim()).maybeSingle()
      if (existing) { alert(`이미 사용 중인 REF 코드입니다: ${refCode}`); return }
    }
    const data = await callApi("/api/admin/create-user", {
      name, email, phone, password, role, ref_code: refCode,
      bank_name: bankName, bank_account: accountNumber, account_holder: accountHolder,
    })
    if (data.error) { alert(data.error); return }
    alert("유저 생성 완료")
    setName(""); setEmail(""); setPhone(""); setPassword(""); setRole("manager"); setRefCode("")
    setBankName(""); setAccountNumber(""); setAccountHolder("")
    fetchUsers()
  }

  async function deleteUser(id: string) {
    if (!confirm("정말 삭제할까요?")) return
    const data = await callApi("/api/admin/delete-user", { id })
    if (data.error) { alert(data.error); return }
    alert("유저 삭제 완료")
    fetchUsers()
  }

  async function toggleUserStatus(id: string, currentStatus: boolean) {
    const { error } = await supabase.from("users").update({ is_active: !currentStatus }).eq("id", id)
    if (error) { console.error(error); return }
    fetchUsers()
  }

  async function resetPassword(id: string) {
    const newPassword = prompt("새 비밀번호 입력")
    if (!newPassword) return
    const data = await callApi("/api/admin/reset-password", { id, password: newPassword })
    if (data.error) { alert(data.error); return }
    alert("비밀번호 변경 완료")
  }

  async function saveUser() {
    if (editingUser.ref_code?.trim()) {
      const { data: existing } = await supabase
        .from("users").select("id").eq("ref_code", editingUser.ref_code.trim()).maybeSingle()
      if (existing && existing.id !== editingUser.id) {
        alert(`이미 사용 중인 REF 코드입니다: ${editingUser.ref_code}`); return
      }
    }
    const { error } = await supabase.from("users").update({
      phone:          editingUser.phone,
      ref_code:       editingUser.ref_code,
      bank_name:      editingUser.bank_name,
      bank_account:   editingUser.bank_account,
      account_holder: editingUser.account_holder,
    }).eq("id", editingUser.id)
    if (error) { alert(error.message); return }
    alert("수정 완료")
    setEditingUser(null)
    fetchUsers()
  }

  const internalUsers = users.filter((u) => ["admin", "manager", "cs"].includes(u.role))
  const partnerUsers  = users.filter((u) => u.role === "partner")

  if (loading) {
    return null
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-10">

      <h1 className="text-3xl font-bold mb-10">유저 생성</h1>

      <div className="flex gap-10 items-start mb-10">

        {/* 폼 영역 */}
        <div className="w-full max-w-md space-y-4">
          {[
            { type: "text",     placeholder: "이름",     value: name,     onChange: setName },
            { type: "email",    placeholder: "이메일",   value: email,    onChange: setEmail },
            { type: "password", placeholder: "비밀번호", value: password, onChange: setPassword },
          ].map(({ type, placeholder, value, onChange }) => (
            <input key={placeholder} type={type} placeholder={placeholder} value={value}
              onChange={(e) => onChange(e.target.value)} className={fieldCls} />
          ))}

          <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldCls}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          {role === "partner" && (
            <div className="space-y-3 border border-blue-500/30 bg-blue-500/5 rounded-xl p-4">
              <p className="text-blue-400 text-xs font-semibold tracking-wide uppercase">파트너 전용</p>
              {[
                { placeholder: "휴대폰번호", value: phone,        onChange: setPhone },
                { placeholder: "REF 코드",  value: refCode,       onChange: setRefCode },
                { placeholder: "은행명",     value: bankName,      onChange: setBankName },
                { placeholder: "계좌번호",   value: accountNumber, onChange: setAccountNumber },
                { placeholder: "예금주",     value: accountHolder, onChange: setAccountHolder },
              ].map(({ placeholder, value, onChange }) => (
                <input key={placeholder} type="text" placeholder={placeholder} value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-blue-500/30 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                />
              ))}
            </div>
          )}

          <button onClick={createUser}
            className="w-full bg-white text-black rounded-xl py-3 font-semibold hover:opacity-90 transition">
            유저 생성
          </button>
        </div>
      </div>

      {/* 페이지를 돌아다니는 캐릭터 */}
      <img
        src="/catus.png"
        alt="catus"
        style={{
          position: "fixed",
          left: catPos.x,
          top:  catPos.y,
          width: 260,
          transform: flipped ? "scaleX(-1)" : "scaleX(1)",
          pointerEvents: "none",
          zIndex: 9999,
          filter: "drop-shadow(2px 4px 12px rgba(0,0,0,0.5))",
        }}
      />

      {/* 탭 버튼 */}
      <div className="mt-16 flex gap-3 mb-6">
        {[
          { key: "internal", label: "내부 사용자 테이블" },
          { key: "partner",  label: `파트너 테이블 (${partnerUsers.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key as "internal" | "partner")}
            className={`px-6 py-3 rounded-xl font-semibold transition ${
              activeTab === key
                ? "bg-white text-black"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 내부 사용자 테이블 */}
      {activeTab === "internal" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-950 text-zinc-500 text-sm">
              <tr>
                {["이름", "이메일", "권한", "상태", "관리"].map((h) => (
                  <th key={h} className="text-left p-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {internalUsers.map((user) => (
                <tr key={user.id} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition">
                  <td className="p-4 font-medium">{user.name}</td>
                  <td className="p-4 text-zinc-400">{user.email}</td>
                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {user.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="p-4">
                    <ManageButtons
                      user={user}
                      onDelete={deleteUser}
                      onToggleStatus={toggleUserStatus}
                      onResetPassword={resetPassword}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 파트너 테이블 */}
      {activeTab === "partner" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-950 text-zinc-500 text-sm">
              <tr>
                {["이름", "이메일", "휴대폰", "은행", "계좌번호", "예금주", "REF", "파트너링크", "관리"].map((h) => (
                  <th key={h} className="text-left p-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partnerUsers.map((user) => (
                <tr key={user.id} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition">
                  <td className="p-4 font-medium">{user.name}</td>
                  <td className="p-4 text-zinc-400">{user.email}</td>
                  <td className="p-4 text-zinc-400">{user.phone || "-"}</td>
                  <td className="p-4 text-zinc-400">{user.bank_name || "-"}</td>
                  <td className="p-4 text-zinc-400">{user.bank_account || "-"}</td>
                  <td className="p-4 text-zinc-400">{user.account_holder || "-"}</td>
                  <td className="p-4 text-zinc-400">{user.ref_code || "-"}</td>
                  <td className="p-4">
                    {user.ref_code ? (
                      <div className="flex items-center gap-2">
                        <input readOnly
                          value={`${PARTNER_BASE_URL}?ref=${user.ref_code}`}
                          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm w-60 text-zinc-300"
                        />
                        <button
                          onClick={() => { navigator.clipboard.writeText(`${PARTNER_BASE_URL}?ref=${user.ref_code}`); alert("복사 완료") }}
                          className="bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition">
                          복사
                        </button>
                      </div>
                    ) : "-"}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setEditingUser(user)}
                        className="bg-green-500/20 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-500/30 transition">
                        수정
                      </button>
                      <button onClick={() => deleteUser(user.id)}
                        className="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/30 transition">
                        삭제
                      </button>
                      <button onClick={() => toggleUserStatus(user.id, user.is_active)}
                        className="bg-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition">
                        {user.is_active ? "비활성화" : "활성화"}
                      </button>
                      <button onClick={() => resetPassword(user.id)}
                        className="bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition">
                        비밀번호 초기화
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 파트너 수정 모달 */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 shadow-xl p-6 rounded-2xl w-[500px] space-y-4">
            <h2 className="text-xl font-bold">파트너 정보 수정</h2>
            {[
              { placeholder: "휴대폰번호", field: "phone" },
              { placeholder: "REF 코드",  field: "ref_code" },
              { placeholder: "은행명",     field: "bank_name" },
              { placeholder: "계좌번호",   field: "bank_account" },
              { placeholder: "예금주",     field: "account_holder" },
            ].map(({ placeholder, field }) => (
              <input key={field}
                value={editingUser[field] || ""}
                onChange={(e) => setEditingUser({ ...editingUser, [field]: e.target.value })}
                placeholder={placeholder}
                className={fieldCls}
              />
            ))}
            <div className="flex gap-2">
              <button onClick={saveUser}
                className="flex-1 bg-white text-black py-3 rounded-xl font-medium hover:opacity-90 transition">
                저장
              </button>
              <button onClick={() => setEditingUser(null)}
                className="flex-1 bg-zinc-800 text-zinc-300 py-3 rounded-xl font-medium hover:bg-zinc-700 transition">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}