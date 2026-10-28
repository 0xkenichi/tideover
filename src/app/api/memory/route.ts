import { NextResponse, type NextRequest } from "next/server";
import { decode, encode } from "@/lib/records";
import type { MemoryRecord } from "@/lib/types";
import { isValidNamespace, memoryConfigured, recallAll, saveAll, writesAllowed } from "@/server/memory";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_RECORDS_PER_WRITE = 40;

/** GET /api/memory?ns=tideover:<address>: everything remembered for one wallet. */
export async function GET(request: NextRequest) {
  const namespace = request.nextUrl.searchParams.get("ns") ?? "";
  if (!isValidNamespace(namespace)) {
    return NextResponse.json({ error: "Unknown memory namespace." }, { status: 400 });
  }
  if (!memoryConfigured()) return NextResponse.json({ memories: [], configured: false });
  try {
    return NextResponse.json({ memories: await recallAll(namespace), configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Couldn't recall from Walrus Memory: ${message}` }, { status: 502 });
  }
}

/** POST /api/memory { ns, records }: write new records to Walrus Memory. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const namespace = typeof body?.ns === "string" ? body.ns : "";
  if (!isValidNamespace(namespace)) {
    return NextResponse.json({ error: "Unknown memory namespace." }, { status: 400 });
  }
  if (!writesAllowed()) {
    return NextResponse.json({ error: "This Tideover can't write to Walrus Memory." }, { status: 403 });
  }
  const input: unknown[] = Array.isArray(body?.records) ? body.records : [];
  // Round-trip each record through the memory format, so only well-formed records are stored.
  const records = input
    .slice(0, MAX_RECORDS_PER_WRITE)
    .map((r) => {
      try {
        return decode(encode(r as MemoryRecord));
      } catch {
        return null;
      }
    })
    .filter((r): r is MemoryRecord => r !== null && r.id.length <= 200);
  if (records.length === 0) return NextResponse.json({ saved: [], failed: [] });
  try {
    return NextResponse.json(await saveAll(namespace, records));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Couldn't write to Walrus Memory: ${message}` }, { status: 502 });
  }
}
