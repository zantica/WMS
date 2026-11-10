/** Objeto de valor inmutable; la igualdad es estructural sobre sus props primitivas. */
export abstract class ValueObject<Props extends Readonly<Record<string, string | number | boolean>>> {
  protected constructor(protected readonly props: Props) {}

  equals(other: ValueObject<Props> | undefined): boolean {
    if (other === undefined || this.constructor !== other.constructor) {
      return false;
    }
    return Object.keys(this.props).every((key) => this.props[key] === other.props[key]);
  }
}
