/** Entidad con identidad estable; la igualdad es por id, no por atributos. */
export abstract class Entity<Id extends string = string> {
  constructor(readonly id: Id) {}

  equals(other: Entity<Id> | undefined): boolean {
    return other !== undefined && this.constructor === other.constructor && this.id === other.id;
  }
}
