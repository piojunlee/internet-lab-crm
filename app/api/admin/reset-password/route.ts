import { NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {

  try {

    const {
      id,
      password,
    } = await req.json()

    const { error } =
      await supabase.auth.admin.updateUserById(
        id,
        {
          password,
        }
      )

    if (error) {
      return NextResponse.json({
        error: error.message,
      })
    }

    return NextResponse.json({
      success: true,
    })

  } catch (error) {

    return NextResponse.json({
      error: "비밀번호 변경 실패",
    })

  }

}