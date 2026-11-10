# Reference 4 — Anti-patrones (qué NO hacer)

Ábrela en Fase 2 mientras construyes. Cada regla existe porque un agente sin
este archivo tiende a caer en ella por defecto. Señal general de alarma: si
tu UI podría estar en cualquier otro producto sin cambiar nada, está mal.

## Universales

- Gradiente purple→blue o azul #3B82F6 sin decisión explícita en tokens.
- Tres cards idénticas en fila como "composición": sin jerarquía, sin ritmo.
- `shadow-sm` default de Tailwind en todo, sin escala de elevación definida.
- Border-radius inconsistente (4px en un botón, 16px en la card de al lado).
- Botón solo-icono sin `aria-label`.
- Placeholder usado como label: al escribir, el usuario pierde la pista.
- Iconos decorativos en headings para "dar vida" sin función.
- Marcadores numerados sin secuencia real (los steps son para procesos).
- Splash/intro animado que bloquea el contenido.
- Modales para flujos largos (el modal es para confirmar, no para trabajar).
- `alert()/confirm()` nativos en producción.
- Scroll-jacking y autoplay con sonido.
- Affordances que solo existen en hover (móvil no tiene hover).
- Texto truncado sin ellipsis/`title` y sin forma de verlo completo.

## SaaS / dashboards

- Tabla sin estado loading (skeleton) ni empty state con acción.
- Filtros aplicados sin feedback visible de qué está aplicado (chips de
  filtro activo o equivalentes).
- Densidad inconsistente: una tabla con rows de 36px y otra de 48px.
- Gráficos sin eje, sin leyenda o sin unidades.
- Color como único codificador de estado (rojo/verde): añade icono o texto
  — daltónismo y dark modes rompen el color-only.
- Paginación sin total ni rango ("Página 2" ¿de cuántas?).
- Dashboard sin rango temporal visible en cada bloque de cifras.
- Métricas grandes sin contexto (¿sube o baja? ¿vs. qué período?).

## E-commerce

- Checkout multi-paso sin indicador de progreso ni posibilidad de volver.
- Precio compitiendo con specs y botones por atención: el precio y el CTA
  mandan en la ficha.
- Dos CTAs primarios en la misma vista (uno primario, el resto ghost/outline).
- Pagos sin trust signals cerca del botón (métodos, devoluciones, seguridad).
- Imágenes de producto sin `aspect-ratio` fijo: layout salta (CLS).
- Swatches de color sin label accesible ("Azul marino", no solo el color).

## Marketing / landing

- Hero cuya propuesta no se entiende en ≤10 palabras o ≤5 segundos.
- CTA vago ("Saber más") cuando el usuario puede tener el valor directo.
- Features en cards idénticas sin jerarquía: decide el orden de importancia
  y refléjalo en tamaño/color.
- Testimonios sin nombre/cargo/contexto: valen cero.
- Motion decorativo que retrasa la lectura del contenido.
- Números inventados de tracción ("+10.000 usuarios") si no hay fuente.

## Fintech / salud / legal

- Jerga financiera o clínica sin tooltip ni glosario.
- Cifras no tabulares en columnas de dinero.
- Acción destructiva sin confirmación que resuma qué se pierde.
- Errores genéricos ("Algo salió mal") sin causa ni siguiente paso.
- Contraste reducido por estética: en estos contextos la legibilidad tiene
  peso regulatorio, no es gusto.

## Accesibilidad (floor, no nice-to-have)

- Contraste: ≥4.5:1 texto normal, ≥3:1 texto grande, sobre el fondo real
  (incluido texto sobre accent y sobre imágenes con overlay).
- `outline: none` sin `:focus-visible` alternativo: prohibido.
- Orden de tab lógico (DOM = orden visual en forms).
- Labels asociados (`<label for>`), errores con `aria-describedby`.
- `aria-live` para resultados async (guardado, envío, sincronización).
- `prefers-reduced-motion`: toda animación no esencial se apaga.
- Targets táctiles ≥44px en elementos interactivos touch.
- No transmitir información solo por color o solo por icono.
- Skip-link si hay navegación compleja antes del contenido.
