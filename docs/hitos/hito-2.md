# Hito 2 — App Expo + Inbound + Putaway (ARCHIVADO)

> Guía archivada desde `KNOWLEDGE.md` al cerrar el hito. **Contenido histórico**: puede contener decisiones
> ya superadas. La memoria vigente está en [`KNOWLEDGE.md`](../../KNOWLEDGE.md); las decisiones formales, en [`docs/adr/`](../adr/README.md).

### Qué construir

La app móvil con 4 pantallas y el componente de escaneo.

### Decisiones ya tomadas que la app debe respetar

1. **Autenticación**: La app usará JWT de Clerk. El token se guarda en `expo-secure-store` (nunca en AsyncStorage — no es seguro).

2. **Base URL de la API**: Configurar como variable de entorno de Expo (`app.config.js` o `.env` con `EXPO_PUBLIC_API_URL`).

3. **Manejo de escaneo dual (cámara + HID Bluetooth)**:
   El lector Bluetooth HID simula un teclado físico — envía los caracteres del código de barras seguidos de un `Enter`. La cámara de Expo devuelve el string directamente.
   
   ```typescript
   // El handler onScan debe ser el mismo para ambas fuentes
   function onScan(scannedCode: string) {
     // Aquí NO distinguimos si vino de cámara o HID
     confirmStep({ scannedCode });
   }
   
   // Para HID: usar un TextInput oculto siempre enfocado que captura el "teclado" del lector
   // Para cámara: expo-camera con onBarcodeScanned
   ```

4. **Sonido y vibración obligatorios**: Cada escaneo correcto → vibración corta + sonido de "beep". Cada error → vibración larga + sonido de error. El operario trabaja de pie y no mira la pantalla constantemente.
   ```typescript
   import * as Haptics from 'expo-haptics';
   // Éxito:
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
   // Error:
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
   ```

5. **Modo simulador para desarrollo**: La cámara no funciona en el simulador de iOS/Android. Crear un botón de "Simular escaneo" visible solo en `__DEV__` que permita introducir el código manualmente.

### Pendiente técnico del Hito 1 que afecta al Hito 2

- **Fix obligatorio**: Hacer `orderId` opcional en `WarehouseTask` para las tareas de recepción. Crear migración de Prisma.
- **Fix obligatorio**: En `receipts.ts`, reemplazar `orderId: "receipt-placeholder"` con un modelo `InboundReceipt` propio, o al menos un campo `receiptId` separado.

### Endpoint que la app usará más

```
GET  /api/v1/tasks?type=RECEIVING&status=PENDING  → lista de tareas al abrir la pantalla
POST /api/v1/tasks/:id/start                      → el operario "toma" la tarea
POST /api/v1/tasks/:id/steps/:stepId/confirm      → cada escaneo confirmado
POST /api/v1/receipts/:taskId/confirm-line        → cada producto recibido
```
