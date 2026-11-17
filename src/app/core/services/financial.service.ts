
import { Injectable } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';

import { environment }
  from '../../../environments/environment';

import type {
  Charge,
  ChargeInput,
  Payment,
  PaymentInput,
  PaymentEdit
} from '../models/financial.model';

import {
  validLocalDate
} from '../models/financial.model';

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private readonly base = [
    'clinics',
    environment.clinicId,
    'patients'
  ] as const;

  private uid(): string {
    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }

    return uid;
  }

  private chargesRef(patientId: string) {
    return collection(
      firestore,
      ...this.base,
      patientId,
      'receivables'
    );
  }

  private chargeRef(patientId: string, chargeId: string) {
    return doc(
      firestore,
      ...this.base,
      patientId,
      'receivables',
      chargeId
    );
  }

  private paymentsRef(patientId: string, chargeId: string) {
    return collection(
      firestore,
      ...this.base,
      patientId,
      'receivables',
      chargeId,
      'payments'
    );
  }

  private paymentRef(
    patientId: string,
    chargeId: string,
    paymentId: string
  ) {
    return doc(
      this.paymentsRef(patientId, chargeId),
      paymentId
    );
  }

  private editsRef(patientId: string, chargeId: string) {
    return collection(
      firestore,
      ...this.base,
      patientId,
      'receivables',
      chargeId,
      'paymentEdits'
    );
  }

  private validatePayment(input: PaymentInput): void {
    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents < 1 ||
      input.amountCents > 10_000_000 ||
      !['pix', 'cash', 'card', 'transfer'].includes(
        input.method
      ) ||
      input.note.length > 200
    ) {
      throw new Error('Dados de pagamento inválidos.');
    }
  }

  private statusFor(
    amountCents: number,
    paidCents: number
  ): 'open' | 'partial' | 'paid' {
    if (paidCents === 0) return 'open';
    if (paidCents === amountCents) return 'paid';
    return 'partial';
  }

  async listCharges(patientId: string): Promise<Charge[]> {
    this.uid();

    const snapshot = await getDocs(
      query(this.chargesRef(patientId), limit(100))
    );

    return snapshot.docs.map(item => ({
      ...(item.data() as Omit<
        Charge,
        'id' | 'patientId'
      >),
      id: item.id,
      patientId
    })).sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate)
    );
  }

  async createCharge(
    patientId: string,
    input: ChargeInput
  ): Promise<string> {
    const uid = this.uid();

    if (
      !patientId ||
      input.description.trim().length < 3 ||
      input.description.trim().length > 150 ||
      !validLocalDate(input.dueDate) ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents < 1 ||
      input.amountCents > 10_000_000
    ) {
      throw new Error('Dados da cobrança inválidos.');
    }

    const reference = doc(this.chargesRef(patientId));

    await setDoc(reference, {
      description: input.description.trim(),
      amountCents: input.amountCents,
      paidCents: 0,
      dueDate: input.dueDate,
      status: 'open',
      lastPaymentId: '',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return reference.id;
  }

  async listPayments(
    patientId: string,
    chargeId: string
  ): Promise<Payment[]> {
    this.uid();

    const snapshot = await getDocs(
      query(this.paymentsRef(patientId, chargeId), limit(100))
    );

    return snapshot.docs
      .map(item => ({
        ...(item.data() as Omit<Payment, 'id'>),
        id: item.id
      }))
      .sort((a, b) =>
        b.recordedAt.toMillis() - a.recordedAt.toMillis()
      );
  }

  async listPaymentEdits(
    patientId: string,
    chargeId: string
  ): Promise<PaymentEdit[]> {
    this.uid();

    const snapshot = await getDocs(
      query(this.editsRef(patientId, chargeId), limit(100))
    );

    return snapshot.docs
      .map(item => ({
        ...(item.data() as Omit<PaymentEdit, 'id'>),
        id: item.id
      }))
      .sort((a, b) =>
        b.changedAt.toMillis() - a.changedAt.toMillis()
      );
  }

  async registerPayment(
    patientId: string,
    chargeId: string,
    input: PaymentInput
  ): Promise<void> {
    const uid = this.uid();

    input = {
      ...input,
      note: input.note.trim()
    };

    this.validatePayment(input);

    const chargeRef = this.chargeRef(patientId, chargeId);
    const paymentRef = doc(
      this.paymentsRef(patientId, chargeId)
    );

    await runTransaction(firestore, async tx => {
      const snapshot = await tx.get(chargeRef);

      if (!snapshot.exists()) {
        throw new Error('Cobrança não encontrada.');
      }

      const charge = snapshot.data() as Omit<
        Charge,
        'id' | 'patientId'
      >;

      if (charge.status === 'cancelled') {
        throw new Error('Cobrança cancelada.');
      }

      const balance =
        charge.amountCents - charge.paidCents;

      if (
        balance <= 0 ||
        input.amountCents > balance
      ) {
        throw new Error(
          'O pagamento ultrapassa o saldo devedor.'
        );
      }

      const nextPaid =
        charge.paidCents + input.amountCents;

      tx.set(paymentRef, {
        ...input,
        recordedBy: uid,
        recordedAt: serverTimestamp(),
        editedBy: uid,
        updatedAt: serverTimestamp(),
        revisionId: ''
      });

      tx.update(chargeRef, {
        paidCents: nextPaid,
        status: this.statusFor(
          charge.amountCents,
          nextPaid
        ),
        lastPaymentId: paymentRef.id,
        updatedAt: serverTimestamp()
      });
    });
  }

  async editPayment(
    patientId: string,
    chargeId: string,
    paymentId: string,
    input: PaymentInput
  ): Promise<void> {
    const uid = this.uid();

    input = {
      ...input,
      note: input.note.trim()
    };

    this.validatePayment(input);

    const chargeRef = this.chargeRef(patientId, chargeId);
    const paymentRef = this.paymentRef(
      patientId,
      chargeId,
      paymentId
    );

    const editRef = doc(
      this.editsRef(patientId, chargeId)
    );

    await runTransaction(firestore, async tx => {
      // Primeiro todas as leituras; depois as gravações.
      const chargeSnapshot = await tx.get(chargeRef);
      const paymentSnapshot = await tx.get(paymentRef);

      if (
        !chargeSnapshot.exists() ||
        !paymentSnapshot.exists()
      ) {
        throw new Error('Pagamento não encontrado.');
      }

      const charge = chargeSnapshot.data() as Omit<
        Charge,
        'id' | 'patientId'
      >;

      const payment = paymentSnapshot.data() as Omit<
        Payment,
        'id'
      >;

      if (charge.status === 'cancelled') {
        throw new Error(
          'Não é possível editar pagamentos de cobrança cancelada.'
        );
      }

      const changed =
        payment.amountCents !== input.amountCents ||
        payment.method !== input.method ||
        payment.note !== input.note;

      if (!changed) {
        throw new Error(
          'Nenhuma alteração foi realizada.'
        );
      }

      const newPaid =
        charge.paidCents -
        payment.amountCents +
        input.amountCents;

      if (
        newPaid < 0 ||
        newPaid > charge.amountCents
      ) {
        throw new Error(
          'O novo valor ultrapassa o valor da cobrança.'
        );
      }

      tx.set(editRef, {
        paymentId,
        previousAmountCents: payment.amountCents,
        newAmountCents: input.amountCents,
        previousMethod: payment.method,
        newMethod: input.method,
        previousNote: payment.note,
        newNote: input.note,
        changedBy: uid,
        changedAt: serverTimestamp()
      });

      tx.update(paymentRef, {
        amountCents: input.amountCents,
        method: input.method,
        note: input.note,
        editedBy: uid,
        updatedAt: serverTimestamp(),
        revisionId: editRef.id
      });

      tx.update(chargeRef, {
        paidCents: newPaid,
        status: this.statusFor(
          charge.amountCents,
          newPaid
        ),
        lastPaymentId: paymentId,
        updatedAt: serverTimestamp()
      });
    });
  }

  async cancelCharge(
    patientId: string,
    chargeId: string
  ): Promise<void> {
    this.uid();

    const reference = this.chargeRef(patientId, chargeId);

    await runTransaction(firestore, async tx => {
      const snapshot = await tx.get(reference);

      if (!snapshot.exists()) {
        throw new Error('Cobrança não encontrada.');
      }

      const charge = snapshot.data() as Omit<
        Charge,
        'id' | 'patientId'
      >;

      if (
        charge.status !== 'open' ||
        charge.paidCents !== 0
      ) {
        throw new Error(
          'Só é possível cancelar cobranças sem pagamentos.'
        );
      }

      tx.update(reference, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
    });
  }
}
