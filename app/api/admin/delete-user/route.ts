import { NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {

  try {

    const { id } = await req.json()

    // 삭제 대상 유저 조회
    const { data: targetUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single()

    // admin 삭제 방지
    if (targetUser?.role === "admin") {
      return NextResponse.json({
        error: "admin 삭제 불가",
      })
    }

    // 🔥 applications 연결 제거
    const { error: appError } = await supabase
      .from("applications")
      .update({
        manager_id: null,
        manager: null,
      })
      .eq("manager_id", id)

    if (appError) {
      return NextResponse.json({
        error: appError.message,
      })
    }

    // 🔥 users 테이블 삭제
    const { error: dbError } = await supabase
      .from("users")
      .delete()
      .eq("id", id)

    if (dbError) {
      return NextResponse.json({
        error: dbError.message,
      })
    }

    // 🔥 auth 삭제
    const { error: authError } =
      await supabase.auth.admin.deleteUser(id)

    if (authError) {
      return NextResponse.json({
        error: authError.message,
      })
    }

    return NextResponse.json({
      success: true,
    })

  } catch (error) {

    return NextResponse.json({
      error: "삭제 실패",
    })

  }
}