/** Motivos del Ledger. Espejo del enum `TxReason` de Prisma (el dominio no importa @wms/db). */
export const TX_REASONS = [
  "INBOUND_RECEIPT",
  "PUTAWAY",
  "ALLOCATION",
  "ALLOCATION_CANCEL",
  "PICK",
  "OUTBOUND_SHIPMENT",
  "ADJUSTMENT",
  "RETURN_INBOUND",
] as const;

export type TxReason = (typeof TX_REASONS)[number];
