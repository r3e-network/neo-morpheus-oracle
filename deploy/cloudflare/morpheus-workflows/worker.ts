import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

type CallbackBroadcastParams = {
  job_id: string;
  network: "mainnet" | "testnet";
  payload: Record<string, unknown>;
};

type AutomationExecuteParams = {
  job_id: string;
  network: "mainnet" | "testnet";
  payload: Record<string, unknown>;
};

type WorkflowEnv = {
  MORPHEUS_APP_BACKEND_URL: string;
  MORPHEUS_APP_BACKEND_TOKEN?: string;
  CALLBACK_BROADCAST_WORKFLOW: Workflow<CallbackBroadcastParams>;
  AUTOMATION_EXECUTE_WORKFLOW: Workflow<AutomationExecuteParams>;
};

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveBackendUrl(env: WorkflowEnv, path: string) {
  const baseUrl = trimString(env.MORPHEUS_APP_BACKEND_URL).replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("MORPHEUS_APP_BACKEND_URL is not configured");
  }
  return `${baseUrl}${path}`;
}

function buildBackendHeaders(env: WorkflowEnv) {
  const headers = new Headers({
    "content-type": "application/json",
  });
  const token = trimString(env.MORPHEUS_APP_BACKEND_TOKEN || "");
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-admin-api-key", token);
  }
  return headers;
}

export class CallbackBroadcastWorkflow extends WorkflowEntrypoint<
  WorkflowEnv,
  CallbackBroadcastParams
> {
  async run(event: WorkflowEvent<CallbackBroadcastParams>, step: WorkflowStep) {
    const payload = event.payload;
    if (!payload?.job_id || !payload?.network) {
      throw new Error("job_id and network are required");
    }

    const result = await step.do(
      "broadcast callback payload",
      {
        retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
      },
      async () => {
        const response = await fetch(
          resolveBackendUrl(this.env, "/api/internal/control-plane/callback-broadcast"),
          {
            method: "POST",
            headers: buildBackendHeaders(this.env),
            body: JSON.stringify({
              ...payload.payload,
              network: payload.network,
            }),
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            trimString((body as any)?.error || (body as any)?.message || "") ||
              `callback broadcast failed with status ${response.status}`
          );
        }
        return body;
      }
    );

    return {
      ok: true,
      workflow: "callback_broadcast",
      job_id: payload.job_id,
      network: payload.network,
      result,
    };
  }
}

export class AutomationExecuteWorkflow extends WorkflowEntrypoint<
  WorkflowEnv,
  AutomationExecuteParams
> {
  async run(event: WorkflowEvent<AutomationExecuteParams>, step: WorkflowStep) {
    const payload = event.payload;
    if (!payload?.job_id || !payload?.network) {
      throw new Error("job_id and network are required");
    }

    const result = await step.do(
      "queue automation execution",
      {
        retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
      },
      async () => {
        const response = await fetch(
          resolveBackendUrl(this.env, "/api/internal/control-plane/automation-execute"),
          {
            method: "POST",
            headers: buildBackendHeaders(this.env),
            body: JSON.stringify({
              ...payload.payload,
              network: payload.network,
            }),
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            trimString((body as any)?.error || (body as any)?.message || "") ||
              `automation execute failed with status ${response.status}`
          );
        }
        return body;
      }
    );

    return {
      ok: true,
      workflow: "automation_execute",
      job_id: payload.job_id,
      network: payload.network,
      result,
    };
  }
}

export default {
  async fetch(request: Request, env: WorkflowEnv) {
    const url = new URL(request.url);
    const instanceId = trimString(url.searchParams.get("instanceId"));

    if (request.method === "GET" && instanceId) {
      const workflowName =
        trimString(url.searchParams.get("workflow")) || "callback_broadcast";
      const binding =
        workflowName === "automation_execute"
          ? env.AUTOMATION_EXECUTE_WORKFLOW
          : env.CALLBACK_BROADCAST_WORKFLOW;
      const instance = await binding.get(instanceId);
      return Response.json({
        id: instance.id,
        status: await instance.status(),
      });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const workflow =
      trimString((body as Record<string, unknown>).workflow) || "callback_broadcast";
    const network =
      trimString((body as Record<string, unknown>).network) === "mainnet"
        ? "mainnet"
        : "testnet";
    const jobId = trimString((body as Record<string, unknown>).job_id);
    const params = {
      job_id: jobId,
      network,
      payload:
        ((body as Record<string, unknown>).payload as Record<string, unknown>) || {},
    };

    if (!jobId) {
      return Response.json({ error: "job_id is required" }, { status: 400 });
    }

    const binding =
      workflow === "automation_execute"
        ? env.AUTOMATION_EXECUTE_WORKFLOW
        : env.CALLBACK_BROADCAST_WORKFLOW;

    const instance = await binding.create({
      id: `${workflow}:${network}:${jobId}`,
      params,
    });

    return Response.json({
      id: instance.id,
      details: await instance.status(),
    });
  },
};
