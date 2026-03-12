import { NextRequest, NextResponse } from "next/server";
import { keccak256, toUtf8Bytes } from "ethers";
import { getPublic, sign } from "@toruslabs/eccrypto";

import { recordOperationLog } from "@/lib/operation-logs";

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function base64UrlEncode(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function normalizeOrigin(input: string) {
  const parsed = new URL(input);
  return parsed.origin;
}

export async function GET(request: NextRequest) {
  const candidateOrigin = trimString(request.nextUrl.searchParams.get("origin"))
    || trimString(request.headers.get("origin"))
    || trimString(process.env.NEXT_PUBLIC_APP_URL)
    || trimString(request.nextUrl.origin);

  const clientId = trimString(process.env.WEB3AUTH_CLIENT_ID || process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID);
  const clientSecret = trimString(process.env.WEB3AUTH_CLIENT_SECRET || process.env.WEB3AUTH_APP_KEY);

  try {
    if (!candidateOrigin) throw new Error("origin is required");
    if (!clientId) throw new Error("WEB3AUTH_CLIENT_ID is not configured");
    if (!clientSecret) throw new Error("WEB3AUTH_CLIENT_SECRET is not configured");

    const origin = normalizeOrigin(candidateOrigin);
    const privateKey = Buffer.from(clientSecret.padStart(64, "0"), "hex");
    const derivedClientId = base64UrlEncode(getPublic(privateKey));
    if (derivedClientId !== clientId) {
      throw new Error("WEB3AUTH_CLIENT_SECRET does not match WEB3AUTH_CLIENT_ID");
    }

    const digest = Buffer.from(keccak256(toUtf8Bytes(origin)).replace(/^0x/, ""), "hex");
    const signature = await sign(privateKey, digest);
    const signedOrigin = base64UrlEncode(Buffer.from(signature));

    const responsePayload = {
      client_id: clientId,
      origin,
      origin_data: {
        [origin]: signedOrigin,
      },
    };

    await recordOperationLog({
      route: "/api/web3auth/origin-data",
      method: "GET",
      category: "system",
      requestPayload: { origin },
      responsePayload,
      httpStatus: 200,
      error: null,
      metadata: {
        source: "server-side-origin-signature",
      },
    });

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await recordOperationLog({
      route: "/api/web3auth/origin-data",
      method: "GET",
      category: "system",
      requestPayload: { origin: candidateOrigin || null },
      responsePayload: { error: message },
      httpStatus: 500,
      error: message,
      metadata: {
        source: "server-side-origin-signature",
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
