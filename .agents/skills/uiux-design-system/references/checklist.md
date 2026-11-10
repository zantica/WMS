# Reference 5 — Checklist de entrega (Fase 3)

Ábrela ANTES de declarar done. Verifica ítem por ítem sobre tu propio output.
Si tienes browser disponible: screenshot en 375 / 768 / 1440 y compara contra
tu bloque de Design tokens. Ítems en rojo = arreglar antes de entregar.
Marca el resultado de cada sección (✅ / ❌ + fix aplicado).

## A. Tokens y consistencia

- [ ] Cero hex crudos en classNames: todos los colores vienen de las vars.
- [ ] Un solo archivo fuente de tokens (`tokens.css` / `globals.css` /
      `project.md` en proyectos existentes).
- [ ] Un solo valor de radius por nivel (sm/md/lg) en toda la UI de la tarea.
- [ ] Escala de sombras consistente (1 nivel por capa de elevación, máx. 3).
- [ ] La paleta usada coincide con el bloque `## Design tokens` declarado
      (sin hex que apareciera "porque quedó mejor").
- [ ] Espaciado en escala (múltiplos de 4/8), sin valores sueltos.

## B. Jerarquía y composición

- [ ] Hay un focal point claro en la primera viewport.
- [ ] Un (1) elemento memorable; el resto disciplinado.
- [ ] Niveles tipográficos distinguibles (ratio ≥1.2 entre niveles).
- [ ] No hay más de un CTA primario por vista.
- [ ] Alineaciones consistentes (misma retícula base en la sección).
- [ ] La densidad es la misma en componentes equivalentes (tables, lists).

## C. Responsive

- [ ] 375px sin overflow-x horizontal ni texto cortado.
- [ ] 768px: columnas colapsan en el orden correcto (lo importante arriba).
- [ ] 1440px: el contenido no se estira ilegible (max-width en contenedores
      de texto).
- [ ] Hero/fluid con `clamp()`, no breakpoints a mano para fuentes.
- [ ] Targets táctiles ≥44px en móvil.

## D. Accesibilidad

- [ ] Contraste verificado: texto ≥4.5:1, grande ≥3:1 (incluye texto sobre
      accent y sobre imágenes).
- [ ] `:focus-visible` visible en todo lo interactivo.
- [ ] Tab order lógico en forms (DOM = visual).
- [ ] Inputs con label real (placeholder no cuenta) y error asociado
      (`aria-describedby`).
- [ ] Botones solo-icono con `aria-label`.
- [ ] Animaciones esenciales respetan `prefers-reduced-motion`.
- [ ] Estados no dependen solo del color (icono o texto también).

## E. Estados del componente

- [ ] hover / focus / active / disabled cubiertos.
- [ ] Loading con skeleton (no spinner bloqueando todo).
- [ ] Empty state con acción orientadora, no "No hay datos" a secas.
- [ ] Error con causa + siguiente paso, no "Algo salió mal".
- [ ] Texto largo truncado con ellipsis y acceso al completo (title/tooltip).

## F. Copy

- [ ] Voz activa y botones específicos ("Guardar cambios" > "Submit"/"OK").
- [ ] Headings en sentence case.
- [ ] Cifras con unidades y contexto (fecha, moneda, vs. qué).
- [ ] Errores que orientan al usuario final, no al desarrollador.

## G. Motion

- [ ] Micro-interacciones 150–250ms; nada gratuito bloqueando interacción.
- [ ] Solo un "momento" grande; el resto discreto.
- [ ] La animación responde a una acción o muestra un cambio — no decora.

## H. Data-viz (solo si hay gráficos/tabla de métricas)

- [ ] Eje o encabezados con unidades y leyenda si hay >1 serie.
- [ ] Máx. 5–7 series por gráfico; el resto, "otras" o tabla.
- [ ] Colores de series distinguibles también sin color (labels directas
      cuando se pueda).
- [ ] Números tabulares (`tabular-nums`) en columnas y métricas.
- [ ] Tooltip/detalle accesible por teclado, no solo hover.

---

**Cierre**: si ≥1 sección quedó en ❌ y no la arreglaste, no declares done:
documenta el fix pendiente y arrégalo. La verificación es parte del trabajo,
no un paso opcional.
