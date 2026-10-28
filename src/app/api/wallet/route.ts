import { NextResponse, type NextRequest } from "next/server";
import { TatumError, readWallet, resolveWallet } from "@/server/tatum";

export const dynamic = "force-dynamic";

/** GET /api/wallet?q=<sui address or name.sui> */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const address = await resolveWallet(q);
    if (!address) {
      return NextResponse.json({ error: "That isn't a Sui address or a SuiNS name we could find." }, { status: 400 });
    }
    return NextResponse.json(await readWallet(address));
  } catch (error) {
    const status = error instanceof TatumError && error.status === 429 ? 429 : 502;
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Couldn't read the wallet through Tatum: ${message}` }, { status });
  }
}
