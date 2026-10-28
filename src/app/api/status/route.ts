import { NextResponse } from "next/server";
import { memoryConfigured, memoryHealth, writesAllowed } from "@/server/memory";

export const dynamic = "force-dynamic";

/** Which services are set up. Reports booleans only, never key values. */
export async function GET() {
  const health = await memoryHealth();
  return NextResponse.json({
    tatum: { keySet: Boolean(process.env.TATUM_API_KEY) },
    memory: {
      configured: memoryConfigured(),
      writable: writesAllowed(),
      healthy: health.ok,
      detail: health.detail,
    },
  });
}
