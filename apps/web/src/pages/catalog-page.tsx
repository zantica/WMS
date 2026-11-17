// apps/web/src/pages/catalog-page.tsx
// Vista de Maestro de Producto WMS y Categorías Configurables con Divulgación Progresiva.
//
// ## Design tokens — Catalog Master Data Management
// - Estilo: S5 dark-data-dense
// - Paleta (P2): --bg #0B1120 | --surface #111A2E | --surface-card #162238 | --border #23334D | --text #E8EEF6 | --muted #8CA0BA | --accent #38BDF8 | --success #34D399 | --danger #F43F5E
// - Tipografía (T3): DM Sans (cuerpo e inputs) + JetBrains Mono (SKUs, códigos y contadores), base 14/20
// - Memorable: Navegación por pestañas limpias con formularios de alta colapsables bajo demanda y edición inline de taxonomía

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type { CategoryDTO, ProductDTO } from "@wms/shared-types";
import { useSupervisorSession } from "../context/supervisor-session";
import { useTranslation } from "../context/locale-context";
import { LabelPrintModal } from "../components/labels/label-print-modal";

type CatalogTab = "products" | "categories";

export default function CatalogMasterPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const { t } = useTranslation();

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<CatalogTab>("products");

  // Divulgación progresiva: formularios colapsados por defecto
  const [showCreateProduct, setShowCreateProduct] = useState<boolean>(false);
  const [showCreateCategory, setShowCreateCategory] = useState<boolean>(false);

  // Datos principales
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);

  // Estados de carga y mensajes
  const [loading, setLoading] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selección de productos para impresión de etiquetas (F5.2)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set(),
  );
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Filtros de búsqueda del catálogo
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("");
  const [showInactiveProducts, setShowInactiveProducts] =
    useState<boolean>(false);

  // Formulario nuevo producto
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productCategoryId, setProductCategoryId] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [depthCm, setDepthCm] = useState("");

  // Formulario nueva categoría
  const [catCode, setCatCode] = useState("");
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");

  // Estado de edición inline de categoría para producto
  const [editingProductCatId, setEditingProductCatId] = useState<string | null>(
    null,
  );
  const [tempProductCatValue, setTempProductCatValue] = useState<string>("");

  // ── Carga de datos (únicamente catálogo y categorías) ─────────
  const loadCatalogData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [prodRes, catRes] = await Promise.all([
        client.listProducts({
          q: searchQuery.trim() || undefined,
          categoryId: selectedCategoryFilter || undefined,
          includeInactive: showInactiveProducts,
        }),
        client.listCategories({ includeInactive: true }),
      ]);

      setProducts(prodRes);
      setCategories(catRes);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar el catálogo de productos y categorías";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [
    client,
    searchQuery,
    selectedCategoryFilter,
    showInactiveProducts,
  ]);

  useEffect(() => {
    void loadCatalogData();
  }, [loadCatalogData]);

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
        ...(sku.trim().length > 0 ? { sku: sku.trim() } : {}),
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
      setShowCreateProduct(false);
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
      setShowCreateCategory(false);
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

  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>{t("web.catalog.eyebrow")}</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">{t("web.catalog.pageTitle")}</h1>
          <p className="wms-page-subtitle">{t("web.catalog.pageSubtitle")}</p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadCatalogData();
          }}
          disabled={loading}
        >
          {loading ? t("web.catalog.syncingBtn") : t("web.catalog.syncBtn")}
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

      {/* ── Barra de Navegación por Pestañas y Divulgación Progresiva ── */}
      <div className="wms-row-between" style={{ marginBottom: "1.25rem" }}>
        <nav
          className="wms-tabs"
          role="tablist"
          aria-label="Subdominios del catálogo"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "products"}
            className={`wms-tab ${activeTab === "products" ? "wms-tab-active" : ""}`}
            onClick={() => setActiveTab("products")}
          >
            <span>{t("web.catalog.tabProducts")}</span>
            <span className="wms-tab-badge">{products.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "categories"}
            className={`wms-tab ${activeTab === "categories" ? "wms-tab-active" : ""}`}
            onClick={() => setActiveTab("categories")}
          >
            <span>{t("web.catalog.tabCategories")}</span>
            <span className="wms-tab-badge">{categories.length}</span>
          </button>
        </nav>

        <div className="wms-actions-row">
          {activeTab === "products" ? (
            <>
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                disabled={selectedProductIds.size === 0}
                onClick={() => setIsPrintModalOpen(true)}
                title={
                  selectedProductIds.size === 0
                    ? "Selecciona productos en la tabla para imprimir etiquetas"
                    : "Imprimir etiquetas de los productos seleccionados"
                }
              >
                🏷️ {t("web.catalog.printLabelsBtn")} {selectedProductIds.size > 0 ? `(${selectedProductIds.size})` : ""}
              </button>
              <button
                type="button"
                className={`wms-btn ${
                  showCreateProduct ? "wms-btn-secondary" : "wms-btn-emerald"
                }`}
                onClick={() => setShowCreateProduct((prev) => !prev)}
              >
                {showCreateProduct
                  ? t("web.catalog.hideFormBtn")
                  : t("web.catalog.newProductBtn")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`wms-btn ${
                showCreateCategory ? "wms-btn-secondary" : "wms-btn-primary"
              }`}
              onClick={() => setShowCreateCategory((prev) => !prev)}
            >
              {showCreateCategory
                ? t("web.catalog.hideFormBtn")
                : t("web.catalog.newCategoryBtn")}
            </button>
          )}
        </div>
      </div>

      {/* ── Formulario de Alta de Producto (Divulgación Progresiva) ──── */}
      {activeTab === "products" && showCreateProduct ? (
        <div className="wms-disclosure-box">
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>{t("web.catalog.formProductTitle")}</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setShowCreateProduct(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form onSubmit={(e) => void handleCreateProduct(e)}>
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Código SKU (opcional, autogenerado si se omite)</span>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Autogenerado ej: ROPA-001 (o manual)"
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
                <span>Código de barras (opcional, EAN-13 autogenerado si se omite)</span>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Autogenerado ej: 20... (o manual)"
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
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setShowCreateProduct(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="wms-btn wms-btn-emerald">
                Registrar producto
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Formulario de Alta de Categoría (Divulgación Progresiva) ── */}
      {activeTab === "categories" && showCreateCategory ? (
        <div className="wms-disclosure-box">
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>◆ Alta de nueva categoría operativa</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setShowCreateCategory(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form onSubmit={(e) => void handleCreateCategory(e)}>
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
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setShowCreateCategory(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="wms-btn wms-btn-primary">
                Crear categoría
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Tab 1: Maestro de Productos ────────────────────────────── */}
      {activeTab === "products" ? (
        <section className="wms-card">
          <div className="wms-row-between" style={{ marginBottom: "1rem" }}>
            <div className="wms-card-title" style={{ margin: 0 }}>
              <span>Referencias del catálogo</span>
              <span className="wms-tag wms-tag-slate">
                {products.length} productos
              </span>
            </div>
          </div>

          {/* Barra de Búsqueda y Filtrado */}
          <form
            className="wms-grid-3"
            style={{ marginBottom: "1.25rem" }}
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
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        products.length > 0 &&
                        selectedProductIds.size === products.length
                      }
                      onChange={() => {
                        if (selectedProductIds.size === products.length) {
                          setSelectedProductIds(new Set());
                        } else {
                          setSelectedProductIds(
                            new Set(products.map((p) => p.id)),
                          );
                        }
                      }}
                      aria-label="Seleccionar todos los productos"
                    />
                  </th>
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
                    <td colSpan={8}>
                      <span
                        className="wms-skeleton"
                        aria-label="Cargando catálogo de productos"
                      />
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
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
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.has(prod.id)}
                          onChange={() => {
                            setSelectedProductIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(prod.id)) next.delete(prod.id);
                              else next.add(prod.id);
                              return next;
                            });
                          }}
                          aria-label={`Seleccionar ${prod.sku}`}
                        />
                      </td>
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
                              style={{
                                padding: "0.15rem 0.4rem",
                                fontSize: "0.7rem",
                              }}
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
      ) : null}

      {/* ── Tab 2: Categorías Operativas ───────────────────────────── */}
      {activeTab === "categories" ? (
        <section className="wms-card">
          <div className="wms-row-between" style={{ marginBottom: "1rem" }}>
            <div className="wms-card-title" style={{ margin: 0 }}>
              <span>Taxonomía y categorías operativas</span>
              <span className="wms-tag wms-tag-slate">
                {categories.length} categorías
              </span>
            </div>
          </div>

          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre descriptivo</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && categories.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <span
                        className="wms-skeleton"
                        aria-label="Cargando categorías"
                      />
                    </td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          Sin categorías configuradas
                        </div>
                        <div className="wms-empty-hint">
                          Pulsa en "+ Nueva categoría" para registrar grupos
                          operativos (ej. CALZADO, ELECTRÓNICA, ROPA).
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
                      <td className="wms-muted">
                        {cat.description ?? "—"}
                      </td>
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
        </section>
      ) : null}

      {/* Modal de Impresión de Etiquetas Logísticas (F5.2) */}
      <LabelPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        entityType="PRODUCT"
        items={products
          .filter((p) => selectedProductIds.has(p.id))
          .map((p) => ({
            id: p.id,
            code: p.sku,
            title: p.name,
            subtitle: p.categoryName,
          }))}
      />
    </>
  );
}
