"use client";

// apps/web/src/app/catalog/page.tsx
// Vista de Maestro de Producto WMS, Categorías configurables, Búsqueda por SKU, Topología Física y Gobierno de Usuarios/Roles.
//
// ## Design tokens — Catalog & Master Data Management
// - Estilo: S5 dark-data-dense
// - Paleta (P2): --bg #0B1120 | --surface #111A2E | --surface-card #162238 | --border #23334D | --text #E8EEF6 | --muted #8CA0BA | --accent #38BDF8 | --success #34D399 | --danger #F43F5E
// - Tipografía (T3): DM Sans (cuerpo e inputs) + JetBrains Mono (SKUs, códigos y contadores), base 14/20
// - Memorable: Consola de control unificada con filtrado reactivo de SKU, gobierno de catálogo y control de accesos sin saltar de pantalla

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type {
  CategoryDTO,
  InventoryBalanceDTO,
  LocationDTO,
  LocationType,
  ProductDTO,
  TenantUserDTO,
  UserRole,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import { groupLocationsByZone } from "../../lib/dashboard-metrics";

export default function CatalogAndLocationsPage(): JSX.Element {
  const { client, session } = useSupervisorSession();

  // Datos principales
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [users, setUsers] = useState<TenantUserDTO[]>([]);
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceDTO[]>([]);

  // Estados de carga y mensajes
  const [loading, setLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros de búsqueda del catálogo
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("");
  const [showInactiveProducts, setShowInactiveProducts] = useState<boolean>(false);

  // Formulario nuevo producto
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productCategoryId, setProductCategoryId] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [depthCm, setDepthCm] = useState("");

  // Formulario nueva ubicación
  const [locCode, setLocCode] = useState("");
  const [locType, setLocType] = useState<LocationType>("STORAGE");
  const [locDescription, setLocDescription] = useState("");

  // Formulario nueva categoría
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");

  // Formulario nuevo usuario
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("OPERATOR");

  // Estado de edición inline de categoría para producto
  const [editingProductCatId, setEditingProductCatId] = useState<string | null>(null);
  const [tempProductCatValue, setTempProductCatValue] = useState<string>("");

  // ── Carga de datos ──────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [prodRes, catRes, userRes, locRes, balRes] = await Promise.all([
        client.listProducts({
          q: searchQuery.trim() || undefined,
          categoryId: selectedCategoryFilter || undefined,
          includeInactive: showInactiveProducts,
        }),
        client.listCategories({ includeInactive: true }),
        client.listUsers({ includeInactive: true }),
        client.listLocations({ warehouseId: session.warehouseId }),
        client.listBalances(),
      ]);

      setProducts(prodRes);
      setCategories(catRes);
      setUsers(userRes);
      setLocations(locRes);
      setBalances(balRes);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar catálogo, usuarios y ubicaciones";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [
    client,
    session.warehouseId,
    searchQuery,
    selectedCategoryFilter,
    showInactiveProducts,
  ]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  // Búsqueda reactiva de productos
  const handleFilterSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setErrorMsg(null);
    try {
      const prods = await client.listProducts({
        q: searchQuery.trim() || undefined,
        categoryId: selectedCategoryFilter || undefined,
        includeInactive: showInactiveProducts,
      });
      setProducts(prods);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error al filtrar productos",
      );
    } finally {
      setIsSearching(false);
    }
  };

  // ── Acciones de Producto ────────────────────────────────────
  async function handleCreateProduct(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsedWeight = Number(weightGrams);
      const parsedWidth = Number(widthCm);
      const parsedHeight = Number(heightCm);
      const parsedDepth = Number(depthCm);

      const created = await client.createProduct({
        sku: sku.trim(),
        name: productName.trim(),
        ...(barcode.trim().length > 0 ? { barcode: barcode.trim() } : {}),
        ...(productCategoryId.trim().length > 0
          ? { categoryId: productCategoryId.trim() }
          : {}),
        ...(Number.isFinite(parsedWeight) && parsedWeight > 0
          ? { weightGrams: parsedWeight }
          : {}),
        ...(Number.isFinite(parsedWidth) && parsedWidth > 0
          ? { widthCm: parsedWidth }
          : {}),
        ...(Number.isFinite(parsedHeight) && parsedHeight > 0
          ? { heightCm: parsedHeight }
          : {}),
        ...(Number.isFinite(parsedDepth) && parsedDepth > 0
          ? { depthCm: parsedDepth }
          : {}),
      });

      setProducts((prev) => [created, ...prev]);
      setSku("");
      setProductName("");
      setBarcode("");
      setProductCategoryId("");
      setWeightGrams("");
      setWidthCm("");
      setHeightCm("");
      setDepthCm("");
      setSuccessMsg(`✓ Producto ${created.sku} (${created.name}) registrado.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear el producto",
      );
    }
  }

  async function handleToggleProductStatus(prod: ProductDTO): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = !prod.isActive;
      const updated = await client.updateProduct(prod.id, {
        isActive: newStatus,
      });

      setProducts((prev) =>
        prev
          .map((p) => (p.id === updated.id ? updated : p))
          .filter((p) => showInactiveProducts || p.isActive),
      );

      setSuccessMsg(
        `✓ Producto ${updated.sku} ${
          newStatus ? "reactivado" : "dado de baja lógica"
        }.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al actualizar estado del producto",
      );
    }
  }

  async function handleSaveProductCategory(prodId: string): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await client.updateProduct(prodId, {
        categoryId: tempProductCatValue ? tempProductCatValue : null,
      });

      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      );
      setEditingProductCatId(null);
      setSuccessMsg(`✓ Categoría del producto ${updated.sku} actualizada.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al actualizar categoría del producto",
      );
    }
  }

  // ── Acciones de Ubicación ───────────────────────────────────
  async function handleCreateLocation(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createLocation({
        warehouseId: session.warehouseId,
        code: locCode.trim().toUpperCase(),
        type: locType,
        ...(locDescription.trim().length > 0
          ? { description: locDescription.trim() }
          : {}),
      });
      setLocations((prev) => [...prev, created]);
      setLocCode("");
      setLocDescription("");
      setSuccessMsg(
        `✓ Ubicación ${created.code} (${created.type}) registrada en ${session.warehouseId}.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear la ubicación",
      );
    }
  }

  // ── Acciones de Categoría ───────────────────────────────────
  async function handleCreateCategory(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createCategory({
        code: catCode.trim().toUpperCase(),
        name: catName.trim(),
        ...(catDescription.trim().length > 0
          ? { description: catDescription.trim() }
          : {}),
      });

      setCategories((prev) => [...prev, created]);
      setCatCode("");
      setCatName("");
      setCatDescription("");
      setSuccessMsg(`✓ Categoría [${created.code}] ${created.name} creada.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear la categoría",
      );
    }
  }

  async function handleToggleCategoryStatus(cat: CategoryDTO): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = !cat.isActive;
      const updated = await client.updateCategory(cat.id, {
        isActive: newStatus,
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setSuccessMsg(
        `✓ Categoría ${updated.code} ${
          newStatus ? "reactivada" : "desactivada"
        }.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al actualizar categoría",
      );
    }
  }

  // ── Acciones de Usuario ─────────────────────────────────────
  async function handleCreateUser(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createUser({
        name: userName.trim(),
        email: userEmail.trim().toLowerCase(),
        role: userRole,
      });

      setUsers((prev) => [...prev, created]);
      setUserName("");
      setUserEmail("");
      setUserRole("OPERATOR");
      setSuccessMsg(
        `✓ Usuario ${created.name} (${created.role}) creado para el tenant.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear el usuario",
      );
    }
  }

  async function handleUpdateUserRole(
    userId: string,
    newRole: UserRole,
  ): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await client.updateUser(userId, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      setSuccessMsg(`✓ Rol de ${updated.name} actualizado a ${updated.role}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error al cambiar rol del usuario",
      );
    }
  }

  async function handleToggleUserStatus(user: TenantUserDTO): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = !user.isActive;
      const updated = await client.updateUser(user.id, {
        isActive: newStatus,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      setSuccessMsg(
        `✓ Cuenta de ${updated.name} ${
          newStatus ? "reactivada" : "desactivada"
        }.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al cambiar estado del usuario",
      );
    }
  }

  const zoneGroups = groupLocationsByZone(locations, balances);
  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>◆ GESTIÓN INTEGRAL DE ALMACÉN</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">
            Catálogo de Productos, Categorías y Topología
          </h1>
          <p className="wms-page-subtitle">
            Administración centralizada de referencias SKU, categorización
            operativa, layout físico y gobierno de accesos por rol.
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadAllData();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando…" : "Sincronizar todo"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error:</strong> {errorMsg}
          </span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* ── 1. Topología Física del Almacén ───────────────────── */}
      <section className="wms-card">
        <div className="wms-card-title">
          <span>Mapa de ubicaciones por zona operativa</span>
          <span className="wms-tag wms-tag-blue">
            {locations.length} ubicaciones registradas
          </span>
        </div>

        <div className="wms-stack">
          {zoneGroups.map((group) => (
            <div key={group.zone} className="wms-zone-block">
              <div className="wms-zone-header">
                <div className="wms-actions-row">
                  <strong>{group.label}</strong>
                  <span className="wms-tag wms-tag-slate wms-mono">
                    {group.zone}
                  </span>
                </div>
                <div className="wms-zone-metrics">
                  <span>
                    Ocupadas: {group.occupiedLocations}/{group.totalLocations}
                  </span>
                  <span>·</span>
                  <span>OnHand: {group.totalOnHand} uds</span>
                  <span>·</span>
                  <span className="wms-text-warning">
                    Reservado: {group.totalAllocated} uds
                  </span>
                  <span>·</span>
                  <strong className="wms-text-success">
                    ATP: {group.totalAtp} uds
                  </strong>
                </div>
              </div>

              {loading && locations.length === 0 ? (
                <span
                  className="wms-skeleton"
                  aria-label={`Cargando zona ${group.zone}`}
                />
              ) : group.locations.length === 0 ? (
                <div className="wms-empty-state">
                  <div className="wms-empty-title">
                    Zona {group.zone} sin ubicaciones configuradas
                  </div>
                  <div className="wms-empty-hint">
                    Utiliza el formulario de alta de ubicación física para
                    habilitar posiciones en esta zona operativa.
                  </div>
                </div>
              ) : (
                <div className="wms-location-grid">
                  {group.locations.map((node) => (
                    <div
                      key={node.location.id}
                      className={`wms-location-cell ${
                        node.isOccupied ? "wms-location-occupied" : ""
                      }`}
                    >
                      <div className="wms-row-between">
                        <strong className="wms-mono">
                          {node.location.code}
                        </strong>
                        <span
                          className={`wms-tag ${
                            node.isOccupied
                              ? "wms-tag-emerald"
                              : "wms-tag-slate"
                          }`}
                        >
                          {node.isOccupied
                            ? `● ${node.skuCount} SKU(s)`
                            : "○ VACÍA"}
                        </span>
                      </div>
                      <div
                        className="wms-cell-meta"
                        title={node.location.description ?? "Sin descripción"}
                      >
                        {node.location.description ?? "Sin descripción"}
                      </div>
                      <div className="wms-cell-stats">
                        <span>OH: {node.onHandQty}</span>
                        <span className="wms-text-warning">
                          AL: {node.allocatedQty}
                        </span>
                        <strong className="wms-text-success">
                          ATP: {node.atpQty}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. Formularios de Alta: Producto y Ubicación ────────── */}
      <section className="wms-grid-2">
        <form className="wms-card" onSubmit={(e) => void handleCreateProduct(e)}>
          <h2 className="wms-card-title">Alta de producto en catálogo</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Código SKU *</span>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="PROD-010"
              />
            </label>
            <label className="wms-field">
              <span>Nombre descriptivo *</span>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Auriculares Bluetooth Pro"
              />
            </label>
            <label className="wms-field">
              <span>Categoría de producto</span>
              <select
                value={productCategoryId}
                onChange={(e) => setProductCategoryId(e.target.value)}
              >
                <option value="">— Sin categoría —</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wms-field">
              <span>Código de barras (EAN / QR)</span>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="8410376000999"
              />
            </label>
            <label className="wms-field">
              <span>Peso unitario (gramos)</span>
              <input
                type="number"
                min={1}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="350"
              />
            </label>
            <label className="wms-field">
              <span>Dimensiones (Ancho x Alto x Fondo cm)</span>
              <div className="wms-actions-row">
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={widthCm}
                  onChange={(e) => setWidthCm(e.target.value)}
                  placeholder="Ancho"
                />
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="Alto"
                />
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={depthCm}
                  onChange={(e) => setDepthCm(e.target.value)}
                  placeholder="Fondo"
                />
              </div>
            </label>
          </div>
          <div className="wms-form-footer">
            <button type="submit" className="wms-btn wms-btn-emerald">
              Registrar producto
            </button>
          </div>
        </form>

        <form
          className="wms-card"
          onSubmit={(e) => void handleCreateLocation(e)}
        >
          <h2 className="wms-card-title">Alta de ubicación física</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Código de posición *</span>
              <input
                type="text"
                required
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
                placeholder="A-11-01"
              />
            </label>
            <label className="wms-field">
              <span>Zona operativa (LocationType) *</span>
              <select
                value={locType}
                onChange={(e) => setLocType(e.target.value as LocationType)}
              >
                <option value="RECEIVING">RECEIVING (Muelle entrada)</option>
                <option value="STORAGE">STORAGE (Estantería picking)</option>
                <option value="PACKING">PACKING (Mesa empaquetado)</option>
                <option value="DISPATCH">DISPATCH (Muelle salida)</option>
              </select>
            </label>
            <label className="wms-field wms-field-full">
              <span>Descripción de pasillo / nivel</span>
              <input
                type="text"
                value={locDescription}
                onChange={(e) => setLocDescription(e.target.value)}
                placeholder="Pasillo A · Nivel 1 · Frontal"
              />
            </label>
          </div>
          <div className="wms-form-footer">
            <button type="submit" className="wms-btn wms-btn-secondary">
              Registrar ubicación
            </button>
          </div>
        </form>
      </section>

      {/* ── 3. Catálogo Maestro de Productos ──────────────────── */}
      <section className="wms-card">
        <div className="wms-row-between">
          <div className="wms-card-title">
            <span>Catálogo maestro de productos (Maestro WMS)</span>
            <span className="wms-tag wms-tag-slate">
              {products.length} referencias cargadas
            </span>
          </div>
        </div>

        {/* Barra de Búsqueda y Filtrado */}
        <form
          className="wms-grid-3"
          style={{ marginBottom: "1rem" }}
          onSubmit={(e) => void handleFilterSubmit(e)}
        >
          <label className="wms-field">
            <span>Buscar por SKU, Nombre o Código de barras</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ej: PROD, Camiseta, 8410..."
            />
          </label>
          <label className="wms-field">
            <span>Filtrar por Categoría</span>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.code}] {c.name} {!c.isActive ? "(Inactiva)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="wms-actions-row" style={{ alignItems: "flex-end" }}>
            <label
              className="wms-actions-row"
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <input
                type="checkbox"
                checked={showInactiveProducts}
                onChange={(e) => setShowInactiveProducts(e.target.checked)}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Mostrar bajas lógicas
              </span>
            </label>
            <button
              type="submit"
              className="wms-btn wms-btn-primary wms-btn-sm"
              disabled={isSearching}
            >
              {isSearching ? "Buscando…" : "Aplicar filtros"}
            </button>
          </div>
        </form>

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre del producto</th>
                <th>Categoría</th>
                <th>Código de barras</th>
                <th className="wms-num">Peso (g)</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <span
                      className="wms-skeleton"
                      aria-label="Cargando catálogo de productos"
                    />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="wms-empty-state">
                      <div className="wms-empty-title">
                        No se encontraron productos coincidentes
                      </div>
                      <div className="wms-empty-hint">
                        Prueba ajustando los términos de búsqueda o el selector
                        de categoría.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((prod) => (
                  <tr key={prod.id}>
                    <td className="wms-mono">
                      <strong>{prod.sku}</strong>
                    </td>
                    <td>{prod.name}</td>
                    <td>
                      {editingProductCatId === prod.id ? (
                        <div className="wms-actions-row">
                          <select
                            value={tempProductCatValue}
                            onChange={(e) =>
                              setTempProductCatValue(e.target.value)
                            }
                            style={{ fontSize: "0.8rem", padding: "0.2rem" }}
                          >
                            <option value="">— Sin categoría —</option>
                            {activeCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="wms-btn wms-btn-emerald wms-btn-sm"
                            onClick={() => void handleSaveProductCategory(prod.id)}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="wms-btn wms-btn-outline wms-btn-sm"
                            onClick={() => setEditingProductCatId(null)}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="wms-actions-row">
                          <span
                            className={`wms-tag ${
                              prod.categoryCode
                                ? "wms-tag-blue"
                                : "wms-tag-slate"
                            } wms-mono`}
                          >
                            {prod.categoryCode ?? "SIN CAT"}
                          </span>
                          <button
                            type="button"
                            className="wms-btn wms-btn-outline wms-btn-sm"
                            title="Cambiar categoría"
                            style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                            onClick={() => {
                              setEditingProductCatId(prod.id);
                              setTempProductCatValue(prod.categoryId ?? "");
                            }}
                          >
                            ✎
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="wms-mono wms-muted">
                      {prod.barcode ?? "—"}
                    </td>
                    <td className="wms-num">
                      {prod.weightGrams ? `${prod.weightGrams} g` : "—"}
                    </td>
                    <td>
                      <span
                        className={`wms-tag ${
                          prod.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                        }`}
                      >
                        {prod.isActive ? "● ACTIVO" : "○ INACTIVO"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={`wms-btn wms-btn-sm ${
                          prod.isActive
                            ? "wms-btn-danger"
                            : "wms-btn-emerald"
                        }`}
                        onClick={() => void handleToggleProductStatus(prod)}
                      >
                        {prod.isActive ? "Desactivar" : "Reactivar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 4. Categorías Operativas WMS y Gobierno de Usuarios ─ */}
      <section className="wms-grid-2">
        {/* Panel de Categorías Operativas */}
        <div className="wms-card">
          <div className="wms-row-between">
            <h2 className="wms-card-title">Categorías Operativas WMS</h2>
            <span className="wms-tag wms-tag-slate">
              {categories.length} categorías
            </span>
          </div>

          <form
            onSubmit={(e) => void handleCreateCategory(e)}
            style={{ marginBottom: "1rem" }}
          >
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Código único *</span>
                <input
                  type="text"
                  required
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  placeholder="CALZADO"
                />
              </label>
              <label className="wms-field">
                <span>Nombre descriptivo *</span>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Calzado deportivo y formal"
                />
              </label>
              <label className="wms-field wms-field-full">
                <span>Descripción (opcional)</span>
                <input
                  type="text"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Zapatos, botas y zapatillas"
                />
              </label>
            </div>
            <div className="wms-form-footer">
              <button type="submit" className="wms-btn wms-btn-primary wms-btn-sm">
                Crear categoría
              </button>
            </div>
          </form>

          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          Sin categorías configuradas
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id}>
                      <td className="wms-mono">
                        <strong>{cat.code}</strong>
                      </td>
                      <td>{cat.name}</td>
                      <td>
                        <span
                          className={`wms-tag ${
                            cat.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                          }`}
                        >
                          {cat.isActive ? "● ACTIVA" : "○ INACTIVA"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={`wms-btn wms-btn-sm ${
                            cat.isActive ? "wms-btn-outline" : "wms-btn-emerald"
                          }`}
                          onClick={() => void handleToggleCategoryStatus(cat)}
                        >
                          {cat.isActive ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel de Usuarios y Roles del Tenant */}
        <div className="wms-card">
          <div className="wms-row-between">
            <h2 className="wms-card-title">Usuarios y Roles del Tenant</h2>
            <span className="wms-tag wms-tag-slate">
              {users.length} miembros
            </span>
          </div>

          <form
            onSubmit={(e) => void handleCreateUser(e)}
            style={{ marginBottom: "1rem" }}
          >
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Nombre completo *</span>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Pedro Gómez"
                />
              </label>
              <label className="wms-field">
                <span>Email corporativo *</span>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="pedro.gomez@empresa.com"
                />
              </label>
              <label className="wms-field wms-field-full">
                <span>Rol operativo *</span>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                >
                  <option value="OPERATOR">OPERATOR (App Móvil / Escáner)</option>
                  <option value="SUPERVISOR">SUPERVISOR (Control de planta y catálogo)</option>
                  <option value="ADMIN">ADMIN (Acceso total e inquilino)</option>
                </select>
              </label>
            </div>
            <div className="wms-form-footer">
              <button type="submit" className="wms-btn wms-btn-primary wms-btn-sm">
                Registrar usuario
              </button>
            </div>
          </form>

          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          Sin usuarios registrados
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((usr) => (
                    <tr key={usr.id}>
                      <td>
                        <strong>{usr.name}</strong>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                          }}
                        >
                          {usr.email}
                        </div>
                      </td>
                      <td>
                        <select
                          value={usr.role}
                          onChange={(e) =>
                            void handleUpdateUserRole(
                              usr.id,
                              e.target.value as UserRole,
                            )
                          }
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.2rem",
                            color:
                              usr.role === "ADMIN"
                                ? "var(--warning)"
                                : usr.role === "SUPERVISOR"
                                ? "var(--accent)"
                                : "var(--text)",
                          }}
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="SUPERVISOR">SUPERVISOR</option>
                          <option value="OPERATOR">OPERATOR</option>
                        </select>
                      </td>
                      <td>
                        <span
                          className={`wms-tag ${
                            usr.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                          }`}
                        >
                          {usr.isActive ? "● ACTIVO" : "○ INACTIVO"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className={`wms-btn wms-btn-sm ${
                            usr.isActive
                              ? "wms-btn-danger"
                              : "wms-btn-emerald"
                          }`}
                          onClick={() => void handleToggleUserStatus(usr)}
                        >
                          {usr.isActive ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
