import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { recordOperationLog } from "@/lib/operation-logs";
import { getServerSupabaseClient, resolveProjectIdBySlug } from "@/lib/server-supabase";

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ciphertext = trimString(body?.ciphertext);
  const targetChain = trimString(body?.target_chain || body?.targetChain || "neo_n3");
  const projectSlug = trimString(body?.project_slug || body?.projectSlug || "");
  const name = trimString(body?.name || "") || `cipher-ref:${randomUUID()}`;
  const algorithm = trimString(body?.encryption_algorithm || body?.algorithm || "client-supplied-ciphertext");
  const metadata = typeof body?.metadata === "object" && body?.metadata ? body.metadata : {};

  if (!ciphertext) {
    return NextResponse.json({ error: "ciphertext is required" }, { status: 400 });
  }
  if (targetChain !== "neo_n3" && targetChain !== "neo_x") {
    return NextResponse.json({ error: "target_chain must be neo_n3 or neo_x" }, { status: 400 });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase server client is not configured" }, { status: 500 });
  }

  try {
    const projectId = projectSlug ? await resolveProjectIdBySlug(supabase, projectSlug) : null;
    const row = {
      project_id: projectId,
      name,
      target_chain: targetChain,
      encryption_algorithm: algorithm,
      key_version: 1,
      ciphertext,
      metadata: {
        source: "api.confidential.store",
        ...metadata,
      },
    };

    const { data, error } = await supabase
      .from("morpheus_encrypted_secrets")
      .insert(row)
      .select("id,name,target_chain,encryption_algorithm,created_at")
      .single();
    if (error) throw error;

    const responsePayload = {
      secret_ref: data.id,
      name: data.name,
      target_chain: data.target_chain,
      encryption_algorithm: data.encryption_algorithm,
      created_at: data.created_at,
    };

    await recordOperationLog({
      route: "/api/confidential/store",
      method: "POST",
      category: "system",
      requestPayload: {
        project_slug: projectSlug || null,
        target_chain: targetChain,
        ciphertext,
      },
      responsePayload,
      httpStatus: 200,
      metadata: {
        secret_name: data.name,
        secret_ref: data.id,
      },
    });

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordOperationLog({
      route: "/api/confidential/store",
      method: "POST",
      category: "system",
      requestPayload: {
        project_slug: projectSlug || null,
        target_chain: targetChain,
        ciphertext,
      },
      responsePayload: { error: message },
      httpStatus: 500,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
