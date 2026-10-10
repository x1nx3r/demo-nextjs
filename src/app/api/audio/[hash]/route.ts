import { getSession } from "@/lib/auth";
import { audioKey } from "@/lib/storage/keys";
import { getBytes } from "@/lib/store/objects";
import { setTenant } from "@/lib/tenant";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ hash: string }> };

/**
 * Stream a cached chunk from RustFS. Range-aware, which mobile Safari needs for
 * seeking. Keys are content hashes, so responses are immutable and cacheable.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  setTenant(session.uid);

  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return new Response("Invalid hash", { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await getBytes(audioKey(hash));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const total = bytes.length;
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const range = request.headers.get("range");
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (match) {
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const slice = bytes.subarray(start, Math.min(end, total - 1) + 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(slice.length));
    return new Response(new Uint8Array(slice), { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
