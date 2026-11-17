
import type { Timestamp } from 'firebase/firestore';

export type ChargeStatus =
  | 'open'
  | 'partial'
  | 'paid'
  | 'cancelled';

export type PaymentMethod =
  | 'pix'
  | 'cash'
  | 'card'
  | 'transfer';

export interface ChargeInput {
  description: string;
  amountCents: number;
  dueDate: string;
}

export interface Charge extends ChargeInput {
  id: string;
  patientId: string;
  paidCents: number;
  status: ChargeStatus;
  lastPaymentId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentInput {
  amountCents: number;
  method: PaymentMethod;
  note: string;
}

export interface Payment extends PaymentInput {
  id: string;
  recordedBy: string;
  recordedAt: Timestamp;
  editedBy: string;
  updatedAt: Timestamp;
  revisionId: string;
}

export interface PaymentEdit {
  id: string;
  paymentId: string;
  previousAmountCents: number;
  newAmountCents: number;
  previousMethod: PaymentMethod;
  newMethod: PaymentMethod;
  previousNote: string;
  newNote: string;
  changedBy: string;
  changedAt: Timestamp;
}

export const PAYMENT_METHODS: Record<
  PaymentMethod,
  string
> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  card: 'Cartão',
  transfer: 'Transferência'
};

export function remainingCents(charge: Charge): number {
  if (charge.status === 'cancelled') return 0;

  return Math.max(
    0,
    charge.amountCents - charge.paidCents
  );
}

export function localToday(): string {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

export function validLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);

  return year >= 1900
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

export function parseMoneyToCents(
  value: string
): number | null {
  const normalized = value.trim().replace(',', '.');

  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [integer, decimal = ''] = normalized.split('.');

  const amount =
    Number(integer) * 100 +
    Number(decimal.padEnd(2, '0'));

  return Number.isSafeInteger(amount)
  && amount >= 1
  && amount <= 10_000_000
    ? amount
    : null;
}

export function centsToInput(amount: number): string {
  return (
    Math.floor(amount / 100) +
    ',' +
    String(amount % 100).padStart(2, '0')
  );
}

export function isOverdue(
  charge: Charge,
  today = localToday()
): boolean {
  return remainingCents(charge) > 0
    && charge.dueDate < today;
}
