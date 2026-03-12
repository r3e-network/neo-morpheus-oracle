import { resolveMorpheusDid } from "@/lib/neodid-did";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const did = url.searchParams.get("did") || "";
  const format = url.searchParams.get("format");

  const result = await resolveMorpheusDid(did, {
    origin: url.origin,
    accept: request.headers.get("accept"),
    format,
  });

  return new Response(JSON.stringify(result.body, null, 2), {
    status: result.status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
      "content-type": `${result.contentType}; charset=utf-8`,
      vary: "accept",
    },
  });
}
