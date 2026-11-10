import { Entity } from "../shared/entity.js";
import {
  InvalidQuantityError,
  ScanExceedsExpectedError,
  StepAlreadyResolvedError,
} from "../shared/domain-error.js";
import { Quantity } from "../inventory/quantity.js";
import { isStepResolved, type StepStatus } from "./task-state-machine.js";

export interface TaskStepProps {
  id: string;
  expectedQty: number;
  scannedQty?: number;
  status?: StepStatus;
}

/** Paso de una tarea: se completa al escanear exactamente la cantidad esperada. */
export class TaskStep extends Entity {
  private expected: Quantity;
  private scanned: Quantity;
  private currentStatus: StepStatus;

  constructor(props: TaskStepProps) {
    super(props.id);
    this.expected = Quantity.positive(props.expectedQty);
    this.scanned = Quantity.of(props.scannedQty ?? 0);
    this.currentStatus = props.status ?? "PENDING";
    if (this.scanned.isGreaterThan(this.expected)) {
      throw new InvalidQuantityError("scannedQty cannot exceed expectedQty", {
        expectedQty: this.expected.value,
        scannedQty: this.scanned.value,
      });
    }
  }

  get status(): StepStatus {
    return this.currentStatus;
  }

  get expectedQty(): number {
    return this.expected.value;
  }

  get scannedQty(): number {
    return this.scanned.value;
  }

  /** Cantidad aún por escanear (nunca negativa). */
  get remainingQty(): number {
    return this.expected.subtract(this.scanned).value;
  }

  get isResolved(): boolean {
    return isStepResolved(this.currentStatus);
  }

  /** Registra un escaneo; el paso pasa a COMPLETED al alcanzar lo esperado. */
  scan(quantity: number): StepStatus {
    this.assertPending();
    const qty = Quantity.positive(quantity);
    const next = this.scanned.add(qty);
    if (next.isGreaterThan(this.expected)) {
      throw new ScanExceedsExpectedError("Scan exceeds expected quantity", {
        stepId: this.id,
        expectedQty: this.expected.value,
        scannedQty: next.value,
      });
    }
    this.scanned = next;
    if (!next.isLessThan(this.expected)) {
      this.currentStatus = "COMPLETED";
    }
    return this.currentStatus;
  }

  reportException(): void {
    this.assertPending();
    this.currentStatus = "EXCEPTION";
  }

  skip(): void {
    this.assertPending();
    this.currentStatus = "SKIPPED";
  }

  private assertPending(): void {
    if (this.isResolved) {
      throw new StepAlreadyResolvedError(`Step ${this.id} is already ${this.currentStatus}`, {
        stepId: this.id,
        status: this.currentStatus,
      });
    }
  }
}
