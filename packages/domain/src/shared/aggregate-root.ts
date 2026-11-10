import { Entity } from "./entity.js";

/**
 * Raíz de agregado: única puerta de entrada para mutar el estado interno,
 * garantizando las invariantes. Los repositorios persisten agregados completos.
 */
export abstract class AggregateRoot<Id extends string = string> extends Entity<Id> {}
