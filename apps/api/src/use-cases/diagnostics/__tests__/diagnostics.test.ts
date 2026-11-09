// apps/api/src/use-cases/diagnostics/__tests__/diagnostics.test.ts
// Suite de tests unitarios (TDD) para el dominio de Observabilidad y Diagnósticos (F7.1).
// Cubre:
// 1. Happy Path: registro y consulta de errores de diagnóstico con puerto simulado e InMemoryDiagnosticsStore.
// 2. Casos Borde: límites de capacidad (ring buffer), entradas vacías, correlación segura y valores límite.
// 3. Errores de Dominio y Validación: OPERATOR rechazado con FORBIDDEN (403), tenantId vacío, limit fuera de rango.
// 4. Redacción de secretos y Aislamiento Multi-Tenant estricto (Tenant A jamás ve errores de Tenant B).

import { describe, expect, it, vi } from "vitest";
import type { DiagnosticsStore } from "../../../ports/diagnostics-store.js";
import { InMemoryDiagnosticsStore } from "../../../adapters/in-memory-diagnostics-store.js";
import { WmsError } from "../../../plugins/error-handler.js";
import { listDiagnosticErrors } from "../list-diagnostic-errors.js";
import { recordDiagnosticError } from "../record-diagnostic-error.js";
import {
  REDACTED_PLACEHOLDER,
  redactSensitiveData,
  resolveSafeCorrelationId,
} from "../redact-sensitive.js";

describe("redactSensitiveData & resolveSafeCorrelationId (pure utilities)", () => {
  it("redacts sensitive keys recursively in objects and arrays", () => {
    const raw = {
      method: "POST",
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret",
        "x-api-key": "demo-api-key-12345",
        "x-webhook-signature": "sha256=abcdef",
        "content-type": "application/json",
      },
      body: {
        sku: "PROD-001",
        password: "super-secret-password",
        accessToken: "tok_live_999",
        webhookSecret: "whsec_12345",
        clientSecret: "cs_999",
        nested: [
          { apiKey: "key-in-array", normalField: 42 },
          "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.payload.sig",
        ],
      },
    };

    const sanitized = redactSensitiveData(raw) as Record<string, unknown>;
    const headers = sanitized["headers"] as Record<string, unknown>;
    const body = sanitized["body"] as Record<string, unknown>;
    const nested = body["nested"] as unknown[];

    expect(headers["authorization"]).toBe(REDACTED_PLACEHOLDER);
    expect(headers["x-api-key"]).toBe(REDACTED_PLACEHOLDER);
    expect(headers["x-webhook-signature"]).toBe(REDACTED_PLACEHOLDER);
    expect(headers["content-type"]).toBe("application/json");

    expect(body["sku"]).toBe("PROD-001");
    expect(body["password"]).toBe(REDACTED_PLACEHOLDER);
    expect(body["accessToken"]).toBe(REDACTED_PLACEHOLDER);
    expect(body["webhookSecret"]).toBe(REDACTED_PLACEHOLDER);
    expect(body["clientSecret"]).toBe(REDACTED_PLACEHOLDER);
    expect(nested[0]).toEqual({
      apiKey: REDACTED_PLACEHOLDER,
      normalField: 42,
    });
    expect(nested[1]).toBe(REDACTED_PLACEHOLDER);
  });

  it("handles primitives, null, undefined, and circular references safely", () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData(123)).toBe(123);
    expect(redactSensitiveData(true)).toBe(true);
    expect(redactSensitiveData("Safe error message")).toBe(
      "Safe error message",
    );

    const circular: Record<string, unknown> = { name: "node" };
    circular["self"] = circular;
    const sanitized = redactSensitiveData(circular) as Record<string, unknown>;
    expect(sanitized["name"]).toBe("node");
    expect(sanitized["self"]).toBe("[Circular]");
  });

  it("validates incoming correlationId and generates a UUID when missing or unsafe", () => {
    expect(resolveSafeCorrelationId("corr-2026-abc_123.xyz:01")).toBe(
      "corr-2026-abc_123.xyz:01",
    );
    expect(resolveSafeCorrelationId(["corr-from-array", "second"])).toBe(
      "corr-from-array",
    );

    // Vacío, demasiado largo o con caracteres de inyección -> genera UUID seguro
    const fromEmpty = resolveSafeCorrelationId("   ");
    expect(fromEmpty).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const fromCRLF = resolveSafeCorrelationId("bad\r\nheader-injection");
    expect(fromCRLF).not.toContain("\r");
    expect(fromCRLF).toMatch(/^[0-9a-f-]{36}$/i);

    const fromTooLong = resolveSafeCorrelationId("a".repeat(200));
    expect(fromTooLong.length).toBe(36);
  });
});

describe("recordDiagnosticError & listDiagnosticErrors (use-cases with mocked port)", () => {
  it("records a sanitized diagnostic error through the DiagnosticsStore port (Happy Path)", async () => {
    const mockStore: DiagnosticsStore = {
      recordError: vi.fn(async (input) => ({
        id: input.id ?? "diag-1",
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        errorCode: input.errorCode,
        message: input.message,
        statusCode: input.statusCode,
        method: input.method,
        path: input.path,
        userId: input.userId ?? null,
        details: input.details,
        occurredAt: input.occurredAt ?? "2026-10-31T00:00:00.000Z",
      })),
      listErrorsByTenant: vi.fn(async () => []),
    };

    const recorded = await recordDiagnosticError(
      {
        tenantId: "tenant-1",
        correlationId: "corr-101",
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stock insuficiente en A-01-01",
        statusCode: 409,
        method: "post",
        path: "/api/v1/orders/ord-1/allocate",
        userId: "user-sup-1",
        details: {
          productId: "prod-1",
          authorization: "Bearer secret-jwt",
        },
      },
      mockStore,
    );

    expect(recorded.tenantId).toBe("tenant-1");
    expect(recorded.correlationId).toBe("corr-101");
    expect(recorded.method).toBe("POST");
    expect(recorded.details).toEqual({
      productId: "prod-1",
      authorization: REDACTED_PLACEHOLDER,
    });
    expect(mockStore.recordError).toHaveBeenCalledTimes(1);
  });

  it("allows ADMIN and SUPERVISOR to list diagnostic errors for their tenant", async () => {
    const store = new InMemoryDiagnosticsStore();
    await recordDiagnosticError(
      {
        tenantId: "tenant-alpha",
        correlationId: "corr-a1",
        errorCode: "INVALID_SCAN",
        message: "Barcode mismatch",
        statusCode: 422,
        method: "POST",
        path: "/api/v1/tasks/t1/steps/s1/confirm",
        userId: "op-1",
      },
      store,
    );

    const adminResult = await listDiagnosticErrors(
      {
        tenantId: "tenant-alpha",
        userRole: "ADMIN",
        filters: { limit: 10 },
      },
      store,
    );
    expect(adminResult).toHaveLength(1);
    expect(adminResult[0]?.correlationId).toBe("corr-a1");

    const supervisorResult = await listDiagnosticErrors(
      {
        tenantId: "tenant-alpha",
        userRole: "SUPERVISOR",
        filters: { errorCode: "INVALID_SCAN" },
      },
      store,
    );
    expect(supervisorResult).toHaveLength(1);
  });

  it("rejects OPERATOR or missing role with WmsError FORBIDDEN (403)", async () => {
    const store = new InMemoryDiagnosticsStore();

    await expect(
      listDiagnosticErrors(
        {
          tenantId: "tenant-alpha",
          userRole: "OPERATOR",
        },
        store,
      ),
    ).rejects.toMatchObject({
      name: "WmsError",
      code: "FORBIDDEN",
      statusCode: 403,
    });

    await expect(
      listDiagnosticErrors(
        {
          tenantId: "tenant-alpha",
          userRole: undefined,
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      statusCode: 403,
    });
  });

  it("validates tenantId and filter limits (Domain & Validation Errors)", async () => {
    const store = new InMemoryDiagnosticsStore();

    await expect(
      recordDiagnosticError(
        {
          tenantId: "   ",
          correlationId: "corr-1",
          errorCode: "INTERNAL_ERROR",
          message: "Boom",
          statusCode: 500,
          method: "GET",
          path: "/api/v1/products",
        },
        store,
      ),
    ).rejects.toBeInstanceOf(WmsError);

    await expect(
      listDiagnosticErrors(
        {
          tenantId: "",
          userRole: "ADMIN",
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });

    await expect(
      listDiagnosticErrors(
        {
          tenantId: "tenant-alpha",
          userRole: "ADMIN",
          filters: { limit: 0 },
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 422,
    });

    await expect(
      listDiagnosticErrors(
        {
          tenantId: "tenant-alpha",
          userRole: "ADMIN",
          filters: { limit: 500 },
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 422,
    });
  });
});

describe("InMemoryDiagnosticsStore (Multi-Tenant Isolation & Ring Buffer Edge Cases)", () => {
  it("enforces strict multi-tenant isolation: Tenant A never sees errors from Tenant B", async () => {
    const store = new InMemoryDiagnosticsStore();

    await recordDiagnosticError(
      {
        tenantId: "tenant-A",
        correlationId: "corr-tenant-A",
        errorCode: "PRODUCT_NOT_FOUND",
        message: "SKU no existe en Tenant A",
        statusCode: 404,
        method: "GET",
        path: "/api/v1/products/1",
      },
      store,
    );

    await recordDiagnosticError(
      {
        tenantId: "tenant-B",
        correlationId: "corr-tenant-B",
        errorCode: "INSUFFICIENT_STOCK",
        message: "Sin stock en Tenant B",
        statusCode: 409,
        method: "POST",
        path: "/api/v1/orders/2/allocate",
      },
      store,
    );

    const errorsA = await listDiagnosticErrors(
      { tenantId: "tenant-A", userRole: "ADMIN" },
      store,
    );
    const errorsB = await listDiagnosticErrors(
      { tenantId: "tenant-B", userRole: "SUPERVISOR" },
      store,
    );

    expect(errorsA).toHaveLength(1);
    expect(errorsA[0]?.tenantId).toBe("tenant-A");
    expect(errorsA[0]?.correlationId).toBe("corr-tenant-A");

    expect(errorsB).toHaveLength(1);
    expect(errorsB[0]?.tenantId).toBe("tenant-B");
    expect(errorsB[0]?.correlationId).toBe("corr-tenant-B");

    // Incluso filtrando por el correlationId de otro tenant, devuelve vacío
    const crossLookup = await listDiagnosticErrors(
      {
        tenantId: "tenant-A",
        userRole: "ADMIN",
        filters: { correlationId: "corr-tenant-B" },
      },
      store,
    );
    expect(crossLookup).toEqual([]);
  });

  it("evicts oldest entries per tenant when maxEntriesPerTenant is reached (FIFO ring buffer)", async () => {
    const store = new InMemoryDiagnosticsStore({ maxEntriesPerTenant: 3 });

    for (let i = 1; i <= 5; i++) {
      await recordDiagnosticError(
        {
          tenantId: "tenant-ring",
          correlationId: `corr-${i}`,
          errorCode: "INVALID_SCAN",
          message: `Attempt ${i}`,
          statusCode: 422,
          method: "POST",
          path: "/api/v1/tasks/1/steps/1/confirm",
        },
        store,
      );
    }

    const errors = await listDiagnosticErrors(
      { tenantId: "tenant-ring", userRole: "ADMIN" },
      store,
    );

    // Solo conserva los 3 más recientes en orden inverso (5, 4, 3)
    expect(errors.map((e) => e.correlationId)).toEqual([
      "corr-5",
      "corr-4",
      "corr-3",
    ]);
  });

  it("filters by errorCode and correlationId and respects limit", async () => {
    const store = new InMemoryDiagnosticsStore();

    await recordDiagnosticError(
      {
        tenantId: "t1",
        correlationId: "c-1",
        errorCode: "INVALID_SCAN",
        message: "Scan 1",
        statusCode: 422,
        method: "POST",
        path: "/scan",
      },
      store,
    );
    await recordDiagnosticError(
      {
        tenantId: "t1",
        correlationId: "c-2",
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stock 2",
        statusCode: 409,
        method: "POST",
        path: "/alloc",
      },
      store,
    );
    await recordDiagnosticError(
      {
        tenantId: "t1",
        correlationId: "c-3",
        errorCode: "INVALID_SCAN",
        message: "Scan 3",
        statusCode: 422,
        method: "POST",
        path: "/scan",
      },
      store,
    );

    const byCode = await listDiagnosticErrors(
      {
        tenantId: "t1",
        userRole: "SUPERVISOR",
        filters: { errorCode: "INVALID_SCAN" },
      },
      store,
    );
    expect(byCode.map((e) => e.correlationId)).toEqual(["c-3", "c-1"]);

    const byCodeLimited = await listDiagnosticErrors(
      {
        tenantId: "t1",
        userRole: "SUPERVISOR",
        filters: { errorCode: "INVALID_SCAN", limit: 1 },
      },
      store,
    );
    expect(byCodeLimited.map((e) => e.correlationId)).toEqual(["c-3"]);

    const byCorrelation = await listDiagnosticErrors(
      {
        tenantId: "t1",
        userRole: "ADMIN",
        filters: { correlationId: "c-2" },
      },
      store,
    );
    expect(byCorrelation).toHaveLength(1);
    expect(byCorrelation[0]?.errorCode).toBe("INSUFFICIENT_STOCK");
  });
});
