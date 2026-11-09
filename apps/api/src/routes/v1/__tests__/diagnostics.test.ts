// apps/api/src/routes/v1/__tests__/diagnostics.test.ts
// Suite de tests de integración HTTP (Fastify inject) para Observabilidad y Diagnósticos (F7.1).
// Verifica:
// 1. Propagación de x-correlation-id entrante o generación automática de UUID seguro.
// 2. Enriquecimiento de logs estructurados (correlationId, tenantId, userId, durationMs, errorCode) y redacción de secretos.
// 3. Inclusión de correlationId en ApiError (WmsError, ZodError, Internal Error) y registro en DiagnosticsStore.
// 4. Endpoint GET /api/v1/diagnostics/errors con control de roles (ADMIN/SUPERVISOR 200, OPERATOR 403 FORBIDDEN)
//    y aislamiento multi-tenant estricto entre Tenant A y Tenant B.

import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { z } from "zod";
import { CORRELATION_ID_HEADER } from "@wms/shared-types";

const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@wms/db", () => ({
  prisma: mockPrisma,
}));

import { InMemoryDiagnosticsStore } from "../../../adapters/in-memory-diagnostics-store.js";
import { authPlugin, createJwtToken } from "../../../plugins/auth.js";
import { errorHandler, WmsError } from "../../../plugins/error-handler.js";
import { observabilityPlugin } from "../../../plugins/observability.js";
import { REDACTED_PLACEHOLDER } from "../../../use-cases/diagnostics/redact-sensitive.js";
import { diagnosticsRoutes } from "../diagnostics.js";

const JWT_SECRET = "test-observability-secret";

async function buildDiagnosticsTestApp(store?: InMemoryDiagnosticsStore) {
  const diagnosticsStore = store ?? new InMemoryDiagnosticsStore();
  const capturedLogs: Array<Record<string, unknown>> = [];

  const logStream = {
    write(chunk: string) {
      try {
        capturedLogs.push(JSON.parse(chunk) as Record<string, unknown>);
      } catch {
        // Ignorar líneas no JSON
      }
    },
  };

  const app = Fastify({
    logger: {
      level: "info",
      stream: logStream,
    },
  });

  await app.register(observabilityPlugin, { diagnosticsStore });
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(diagnosticsRoutes, { prefix: "/api/v1/diagnostics" });

  app.get("/health", async (request) => ({
    status: "ok",
    correlationId: request.correlationId,
  }));

  app.post("/api/v1/test-domain-error", async () => {
    throw new WmsError(
      "INSUFFICIENT_STOCK",
      "Stock insuficiente para SKU-001",
      409,
      {
        sku: "SKU-001",
        authorization: "Bearer secret-token-in-details",
        webhookSecret: "whsec_top_secret",
      },
    );
  });

  app.post("/api/v1/test-zod-error", async (request) => {
    const schema = z.object({ quantity: z.number().positive() });
    return schema.parse(request.body);
  });

  app.get("/api/v1/test-crash", async () => {
    throw new Error("Unexpected database timeout");
  });

  await app.ready();
  return { app, diagnosticsStore, capturedLogs };
}

describe("Observability Plugin + ErrorHandler + GET /api/v1/diagnostics/errors (F7.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["JWT_SECRET"] = JWT_SECRET;
  });

  it("propagates a valid incoming x-correlation-id and generates a UUID when omitted or unsafe", async () => {
    const { app } = await buildDiagnosticsTestApp();

    const resWithHeader = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        [CORRELATION_ID_HEADER]: "client-corr-2026-001",
      },
    });

    expect(resWithHeader.statusCode).toBe(200);
    expect(resWithHeader.headers[CORRELATION_ID_HEADER]).toBe(
      "client-corr-2026-001",
    );
    expect(resWithHeader.json()).toEqual({
      status: "ok",
      correlationId: "client-corr-2026-001",
    });

    const resWithoutHeader = await app.inject({
      method: "GET",
      url: "/health",
    });

    const generatedHeader = resWithoutHeader.headers[
      CORRELATION_ID_HEADER
    ] as string;
    expect(generatedHeader).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const resUnsafeHeader = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        [CORRELATION_ID_HEADER]: "evil\r\njected-header: 1",
      },
    });
    expect(resUnsafeHeader.headers[CORRELATION_ID_HEADER]).not.toContain("\r");
  });

  it("emits structured logs with correlationId, tenantId, userId, durationMs, errorCode and redacted secrets", async () => {
    const { app, capturedLogs } = await buildDiagnosticsTestApp();

    const supervisorToken = createJwtToken(
      {
        sub: "user-sup-42",
        tenantId: "tenant-obs-1",
        role: "SUPERVISOR",
      },
      JWT_SECRET,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/test-domain-error",
      headers: {
        authorization: `Bearer ${supervisorToken}`,
        [CORRELATION_ID_HEADER]: "corr-log-check-99",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "Stock insuficiente para SKU-001",
        correlationId: "corr-log-check-99",
        details: {
          sku: "SKU-001",
          authorization: REDACTED_PLACEHOLDER,
          webhookSecret: REDACTED_PLACEHOLDER,
        },
      },
    });

    const completionLog = capturedLogs.find(
      (entry) => entry["correlationId"] === "corr-log-check-99",
    );
    expect(completionLog).toBeDefined();
    expect(completionLog).toMatchObject({
      correlationId: "corr-log-check-99",
      tenantId: "tenant-obs-1",
      userId: "user-sup-42",
      userRole: "SUPERVISOR",
      method: "POST",
      url: "/api/v1/test-domain-error",
      statusCode: 409,
      errorCode: "INSUFFICIENT_STOCK",
    });
    expect(typeof completionLog?.["durationMs"]).toBe("number");

    const loggedHeaders = completionLog?.["headers"] as Record<string, unknown>;
    expect(loggedHeaders["authorization"]).toBe(REDACTED_PLACEHOLDER);
  });

  it("records errors in DiagnosticsStore and allows ADMIN and SUPERVISOR to query them via GET /api/v1/diagnostics/errors", async () => {
    const { app } = await buildDiagnosticsTestApp();

    const supervisorToken = createJwtToken(
      {
        sub: "sup-1",
        tenantId: "tenant-main",
        role: "SUPERVISOR",
      },
      JWT_SECRET,
    );

    // 1. Provocar un error de dominio y un error Zod para tenant-main
    await app.inject({
      method: "POST",
      url: "/api/v1/test-domain-error",
      headers: {
        authorization: `Bearer ${supervisorToken}`,
        [CORRELATION_ID_HEADER]: "corr-dom-1",
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/test-zod-error",
      headers: {
        authorization: `Bearer ${supervisorToken}`,
        [CORRELATION_ID_HEADER]: "corr-zod-2",
      },
      payload: { quantity: -5 },
    });

    // 2. Consultar todos los errores del tenant con rol SUPERVISOR
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors?limit=10",
      headers: {
        authorization: `Bearer ${supervisorToken}`,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data).toHaveLength(2);
    expect(listBody.data[0].correlationId).toBe("corr-zod-2");
    expect(listBody.data[0].errorCode).toBe("VALIDATION_ERROR");
    expect(listBody.data[1].correlationId).toBe("corr-dom-1");
    expect(listBody.data[1].errorCode).toBe("INSUFFICIENT_STOCK");
    expect(listBody.data[1].details.authorization).toBe(REDACTED_PLACEHOLDER);

    // 3. Filtrar por errorCode y correlationId
    const filteredRes = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors?errorCode=INSUFFICIENT_STOCK&correlationId=corr-dom-1",
      headers: {
        authorization: `Bearer ${supervisorToken}`,
      },
    });

    expect(filteredRes.statusCode).toBe(200);
    expect(filteredRes.json().data).toHaveLength(1);
    expect(filteredRes.json().data[0].correlationId).toBe("corr-dom-1");
  });

  it("denies access to OPERATOR on GET /api/v1/diagnostics/errors with 403 FORBIDDEN and correlationId", async () => {
    const { app } = await buildDiagnosticsTestApp();

    const operatorToken = createJwtToken(
      {
        sub: "op-99",
        tenantId: "tenant-main",
        role: "OPERATOR",
      },
      JWT_SECRET,
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors",
      headers: {
        authorization: `Bearer ${operatorToken}`,
        [CORRELATION_ID_HEADER]: "corr-forbidden-op",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe("corr-forbidden-op");
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: "FORBIDDEN",
        correlationId: "corr-forbidden-op",
      },
    });
  });

  it("enforces strict multi-tenant isolation on GET /api/v1/diagnostics/errors", async () => {
    const { app } = await buildDiagnosticsTestApp();

    const tokenTenantA = createJwtToken(
      { sub: "admin-a", tenantId: "tenant-A", role: "ADMIN" },
      JWT_SECRET,
    );
    const tokenTenantB = createJwtToken(
      { sub: "admin-b", tenantId: "tenant-B", role: "ADMIN" },
      JWT_SECRET,
    );

    // Error en Tenant A
    await app.inject({
      method: "POST",
      url: "/api/v1/test-domain-error",
      headers: {
        authorization: `Bearer ${tokenTenantA}`,
        [CORRELATION_ID_HEADER]: "corr-only-A",
      },
    });

    // Error 500 en Tenant B
    const crashRes = await app.inject({
      method: "GET",
      url: "/api/v1/test-crash",
      headers: {
        authorization: `Bearer ${tokenTenantB}`,
        [CORRELATION_ID_HEADER]: "corr-only-B",
      },
    });
    expect(crashRes.statusCode).toBe(500);
    expect(crashRes.json().error.correlationId).toBe("corr-only-B");

    // Tenant A solo ve corr-only-A
    const resA = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors",
      headers: { authorization: `Bearer ${tokenTenantA}` },
    });
    expect(resA.statusCode).toBe(200);
    expect(resA.json().data).toHaveLength(1);
    expect(resA.json().data[0].tenantId).toBe("tenant-A");
    expect(resA.json().data[0].correlationId).toBe("corr-only-A");

    // Tenant B solo ve corr-only-B
    const resB = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors",
      headers: { authorization: `Bearer ${tokenTenantB}` },
    });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().data).toHaveLength(1);
    expect(resB.json().data[0].tenantId).toBe("tenant-B");
    expect(resB.json().data[0].correlationId).toBe("corr-only-B");
  });

  it("validates query parameters (limit out of range returns 422 VALIDATION_ERROR with correlationId)", async () => {
    const { app } = await buildDiagnosticsTestApp();

    const adminToken = createJwtToken(
      { sub: "admin-1", tenantId: "tenant-A", role: "ADMIN" },
      JWT_SECRET,
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/diagnostics/errors?limit=999",
      headers: {
        authorization: `Bearer ${adminToken}`,
        [CORRELATION_ID_HEADER]: "corr-bad-limit",
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        correlationId: "corr-bad-limit",
      },
    });
  });
});
