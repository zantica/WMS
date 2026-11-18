// apps/web/src/components/__tests__/atomic-auth-ui.test.tsx
// Suite de tests para los componentes en Diseño Atómico (atoms, molecules, organisms, templates),
// flujo de Login / Bootstrap Superuser y verificación de cero hex crudos en TSX (S5/P2).

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TenantUserDTO } from "@wms/shared-types";
import { LocaleProvider } from "../../context/locale-context.js";
import {
  SupervisorSessionProvider,
  useSupervisorSession,
  type SupervisorSessionContextValue,
} from "../../context/supervisor-session.js";
import LoginPage from "../../pages/login-page.js";
import TenantUsersPage from "../../pages/users-page.js";
import { Alert } from "../atoms/Alert.js";
import { Badge } from "../atoms/Badge.js";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { Label } from "../atoms/Label.js";
import { Select } from "../atoms/Select.js";
import { FormField } from "../molecules/FormField.js";
import { PasswordField } from "../molecules/PasswordField.js";
import { SessionUserChip } from "../molecules/SessionUserChip.js";
import { UserRoleBadge } from "../molecules/UserRoleBadge.js";
import { BootstrapSuperuserForm } from "../organisms/BootstrapSuperuserForm.js";
import { CreateUserPanel } from "../organisms/CreateUserPanel.js";
import { LoginForm } from "../organisms/LoginForm.js";
import { UsersTable } from "../organisms/UsersTable.js";
import { AuthTemplate } from "../templates/AuthTemplate.js";

describe("F10.1 — Diseño Atómico UI, Auth JWT y Gestión de Usuarios", () => {
  it("renderiza todos los átomos (Button, Input, Select, Badge, Alert, Label) con estados completos", () => {
    const html = renderToStaticMarkup(
      <div>
        <Label htmlFor="inp-1" required>
          Email
        </Label>
        <Input id="inp-1" invalid mono placeholder="admin@navelo.dev" />
        <Select aria-label="Rol" invalid mono defaultValue="ADMIN">
          <option value="ADMIN">ADMIN</option>
        </Select>
        <Button variant="primary" size="sm" loading>
          Guardando
        </Button>
        <Badge tone="rose">SUPERUSER</Badge>
        <Alert variant="error">Credenciales inválidas</Alert>
      </div>,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("wms-tag-rose");
    expect(html).toContain('role="alert"');
    expect(html).toContain("wms-label-required");
  });

  it("renderiza moléculas (FormField, PasswordField, UserRoleBadge, SessionUserChip)", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FormField
          label="Usuario"
          htmlFor="u-field"
          required
          error="Campo obligatorio"
        >
          <Input id="u-field" invalid />
        </FormField>
        <PasswordField
          id="pw-field"
          label="Contraseña"
          value="secret123"
          onChange={vi.fn()}
          showLabel="Mostrar"
          hideLabel="Ocultar"
        />
        <UserRoleBadge role="SUPERUSER" />
        <UserRoleBadge role="ADMIN" />
        <UserRoleBadge role="SUPERVISOR" />
        <UserRoleBadge role="OPERATOR" />
        <SessionUserChip
          currentUser={null}
          loginLabel="Iniciar sesión"
          logoutLabel="Cerrar sesión"
        />
        <SessionUserChip
          currentUser={{
            id: "u1",
            tenantId: "demo-tenant",
            name: "Navelo Superuser",
            email: "admin@navelo.dev",
            role: "SUPERUSER",
            isActive: true,
          }}
          loginLabel="Iniciar sesión"
          logoutLabel="Cerrar sesión"
          onLogout={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Campo obligatorio");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("wms-password-toggle");
    expect(html).toContain("★");
    expect(html).toContain("admin@navelo.dev");
    expect(html).toContain('href="/login"');
    expect(html).toContain("wms-login-trigger");
    expect(html).toContain("wms-session-chip-active");
    expect(html).toContain("wms-session-active-dot");
    expect(html).toContain(">NS</span>");
    expect(html).toContain("Cerrar sesión");
  });

  it("renderiza organismos (LoginForm, BootstrapSuperuserForm, CreateUserPanel, UsersTable) respetando jerarquía SUPERUSER vs ADMIN", () => {
    const sampleUsers: TenantUserDTO[] = [
      {
        id: "u-super",
        tenantId: "demo-tenant",
        clerkId: "user_navelo_superuser",
        name: "Navelo Superuser",
        email: "admin@navelo.dev",
        role: "SUPERUSER",
        isActive: true,
      },
      {
        id: "u-op",
        tenantId: "demo-tenant",
        clerkId: "clerk_op",
        name: "Operador Uno",
        email: "op@demo.com",
        role: "OPERATOR",
        isActive: true,
      },
    ];

    const superCreateHtml = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES">
        <AuthTemplate
          mode="bootstrap"
          onModeChange={vi.fn()}
          title="Inicializar Superuser"
          subtitle="Cuenta raíz"
          footerText="http://localhost:3001"
        >
          <BootstrapSuperuserForm
            onSubmit={vi.fn()}
            requiresSetupSecret
            errorMessage="Error de prueba"
          />
          <LoginForm onSubmit={vi.fn()} defaultEmail="admin@navelo.dev" />
        </AuthTemplate>
        <CreateUserPanel
          actorRole="SUPERUSER"
          onCreate={vi.fn()}
          onClose={vi.fn()}
        />
        <UsersTable
          users={sampleUsers}
          loading={false}
          actorRole="ADMIN"
          onUpdateRole={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(superCreateHtml).toContain('data-testid="auth-template"');
    expect(superCreateHtml).toContain('data-testid="bootstrap-superuser-form"');
    expect(superCreateHtml).toContain('data-testid="login-form"');
    expect(superCreateHtml).toContain('id="wms-bootstrap-secret"');
    expect(superCreateHtml).toContain("¿Usar Tenant ID específico?");
    expect(superCreateHtml).toContain('aria-expanded="false"');
    expect(superCreateHtml).not.toContain('id="wms-login-tenant"');
    expect(superCreateHtml).toContain("wms-btn-block");
    expect(superCreateHtml).toContain('value="SUPERUSER"');
    expect(superCreateHtml).toContain("admin@navelo.dev");

    const loginOnlyHtml = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES">
        <LoginForm onSubmit={vi.fn()} defaultEmail="admin@navelo.dev" />
      </LocaleProvider>,
    );
    expect(loginOnlyHtml).toContain("wms-btn-block");
    expect(loginOnlyHtml).not.toContain("wms-form-footer");

    // ADMIN no tiene opción SUPERUSER en CreateUserPanel
    const adminCreateHtml = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES">
        <CreateUserPanel
          actorRole="ADMIN"
          onCreate={vi.fn()}
          onClose={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(adminCreateHtml).not.toContain('<option value="SUPERUSER"');
  });

  it("renderiza LoginPage (con sesión activa) y TenantUsersPage sin errores SSR", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/login"]}>
        <LocaleProvider initialLocale="es-ES">
          <SupervisorSessionProvider
            initialSession={{
              currentUser: {
                id: "u-root",
                tenantId: "demo-tenant",
                name: "Navelo Superuser",
                email: "admin@navelo.dev",
                role: "SUPERUSER",
                isActive: true,
              },
            }}
          >
            <LoginPage />
            <TenantUsersPage />
          </SupervisorSessionProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('data-testid="active-session-panel"');
    expect(html).toContain("Sesión activa verificada");
    expect(html).toContain("Ya tienes una sesión iniciada como Navelo Superuser (admin@navelo.dev)");
    expect(html).toContain("Ir al Dashboard");
    expect(html).toContain("Cerrar sesión y cambiar de cuenta");
    expect(html).toContain("admin@navelo.dev");
    expect(html).toContain("Control de Usuarios y Roles (RBAC)");
  });

  it("bloquea login() y bootstrapSuperuser() cuando ya existe una sesión activa", async () => {
    let captured: SupervisorSessionContextValue | null = null;
    function SessionProbe(): React.JSX.Element {
      captured = useSupervisorSession();
      return <div />;
    }

    renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES">
        <SupervisorSessionProvider
          initialSession={{
            currentUser: {
              id: "u-root",
              tenantId: "demo-tenant",
              name: "Navelo Superuser",
              email: "admin@navelo.dev",
              role: "SUPERUSER",
              isActive: true,
            },
          }}
        >
          <SessionProbe />
        </SupervisorSessionProvider>
      </LocaleProvider>,
    );

    expect(captured).not.toBeNull();
    expect(captured!.sessionFeedback).toBeNull();

    await expect(
      captured!.login({ email: "other@navelo.dev", password: "Password123!" }),
    ).rejects.toThrow(
      "Ya existe una sesión activa. Cierra la sesión actual antes de iniciar otra.",
    );

    await expect(
      captured!.bootstrapSuperuser({
        name: "Another Admin",
        email: "other@navelo.dev",
        password: "Password123!",
      }),
    ).rejects.toThrow(
      "Ya existe una sesión activa. Cierra la sesión actual antes de iniciar otra.",
    );
  });

  it("garantiza cero colores hex crudos en los componentes TSX de Diseño Atómico, DashboardShell y LoginPage", () => {
    const componentsDir = path.resolve(__dirname, "..");
    const folders = ["atoms", "molecules", "organisms", "templates"];
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;

    for (const folder of folders) {
      const dirPath = path.join(componentsDir, folder);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".tsx"));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(path.join(dirPath, file), "utf8");
        expect(
          hexPattern.test(content),
          `Se encontró hex crudo en ${folder}/${file}`,
        ).toBe(false);
      }
    }

    const extraFiles = [
      path.join(componentsDir, "dashboard-shell.tsx"),
      path.resolve(componentsDir, "../pages/login-page.tsx"),
    ];
    for (const filePath of extraFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const codeWithoutComments = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(
        hexPattern.test(codeWithoutComments),
        `Se encontró hex crudo en ${path.basename(filePath)}`,
      ).toBe(false);
    }
  });
});
