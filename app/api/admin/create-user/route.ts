import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      email,
      password,
      name,
      role,
      phone,
      ref_code,
      bank_name,
      bank_account,
      account_holder,
    } = body

    // ── REF 중복 체크 (API 레벨) ──
    if (role === "partner" && ref_code?.trim()) {
      const { data: existing } = await supabaseAdmin
        .from("users").select("id").eq("ref_code", ref_code.trim()).maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: `이미 사용 중인 REF 코드입니다: ${ref_code}` },
          { status: 409 }
        )
      }
    }

    // ── Auth 유저 생성 ──
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // ── DB 저장 ──
    const insertData = {
      id: authData.user.id,
      email,
      name,
      role,
      phone,
      bank_name,
      bank_account,
      account_holder,
      is_active: true,
      ref_code: role === "partner"
        ? ref_code?.trim()
        : null,
    }
    
    const { error: dbError } = await supabaseAdmin
      .from("users")
      .insert(insertData)

    // ── DB 실패 시 Auth 롤백 ──
    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: dbError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}