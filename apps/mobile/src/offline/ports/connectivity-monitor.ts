// apps/mobile/src/offline/ports/connectivity-monitor.ts
// Puerto hexagonal para la detección reactiva del estado de conectividad a la red.
// Desacopla la lógica de red de NetInfo, Expo Network o navigator.onLine.

export type ConnectivityListener = (isOnline: boolean) => void;

export interface ConnectivityMonitor {
  isOnline(): boolean;
  subscribe(listener: ConnectivityListener): () => void;
  dispose?(): void;
}
