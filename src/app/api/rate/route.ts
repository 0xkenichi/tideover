import { NextResponse } from "next/server";
import { readRate } from "@/server/tatum";

export const dynamic = "force-dynamic";

/** Naira per dollar from Tatum. Answers { rate: null } when it isn't available. */
export async function GET() {
  try {
    return NextResponse.json({ rate: await readRate() });
  } catch (error) {
    return NextResponse.json({ rate: null, error: error instanceof Error ? error.message : String(error) });
  }
}
