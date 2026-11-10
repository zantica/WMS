// apps/mobile/src/offline/adapters/event-connectivity-monitor.ts
// Adaptador de conectividad desacoplado basado en eventos.
// Permite control programático para pruebas y actúa como puente para listeners de plataforma.

import type {
  ConnectivityListener,
  ConnectivityMonitor,
} from "../ports/connectivity-monitor.js";

export class EventConnectivityMonitor implements ConnectivityMonitor {
  private online: boolean;
  private readonly listeners: Set<ConnectivityListener> = new Set();

  constructor(initialOnline = true) {
    this.online = initialOnline;
  }

  public isOnline(): boolean {
    return this.online;
  }

  public setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    for (const listener of this.listeners) {
      listener(this.online);
    }
  }

  public subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.listeners.clear();
  }
}
