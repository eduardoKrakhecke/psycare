
import { Injectable } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';

import { environment } from '../../../environments/environment';

import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  BookedSlot
} from '../models/appointment.model';

import {
  appointmentSlotId,
  validAppointmentTime
} from '../models/appointment.model';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly base = [
    'clinics',
    environment.clinicId
  ] as const;

  private appointmentsRef() {
    return collection(
      firestore,
      ...this.base,
      'appointments'
    );
  }

  private appointmentRef(id: string) {
    return doc(
      firestore,
      ...this.base,
      'appointments',
      id
    );
  }

  private slotRef(id: string) {
    return doc(
      firestore,
      ...this.base,
      'bookedSlots',
      id
    );
  }

  private currentUid(): string {
    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }

    return uid;
  }

  async list(
    startDate: string,
    endDateExclusive: string
  ): Promise<Appointment[]> {
    const reference = query(
      this.appointmentsRef(),
      where('date', '>=', startDate),
      where('date', '<', endDateExclusive),
      limit(500)
    );

    const snapshot = await getDocs(reference);

    return snapshot.docs.map(item => ({
      ...(item.data() as Omit<Appointment, 'id'>),
      id: item.id
    }));
  }

  async create(input: AppointmentInput): Promise<string> {
    if (!validAppointmentTime(input.date, input.startTime)) {
      throw new Error('Horário inválido.');
    }

    const uid = this.currentUid();

    const appointmentRef = doc(this.appointmentsRef());

    const slotId = appointmentSlotId(
      input.professionalId,
      input.date,
      input.startTime
    );

    const slotRef = this.slotRef(slotId);

    await runTransaction(firestore, async transaction => {
      const slot = await transaction.get(slotRef);

      if (slot.exists() && slot.data()['active'] === true) {
        throw new Error('Este horário já está reservado.');
      }

      const appointmentData = {
        ...input,
        slotId,
        status: 'scheduled',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const slotData = {
        appointmentId: appointmentRef.id,
        professionalId: input.professionalId,
        date: input.date,
        startTime: input.startTime,
        active: true,
        updatedAt: serverTimestamp()
      };

      transaction.set(appointmentRef, appointmentData);

      if (slot.exists()) {
        transaction.update(slotRef, slotData);
      } else {
        transaction.set(slotRef, {
          ...slotData,
          createdAt: serverTimestamp()
        });
      }
    });

    return appointmentRef.id;
  }

  async changeStatus(
    appointment: Appointment,
    status: 'confirmed' | 'completed' | 'no_show'
  ): Promise<void> {
    const allowed =
      (
        appointment.status === 'scheduled' &&
        status === 'confirmed'
      ) ||
      (
        appointment.status === 'confirmed' &&
        ['completed', 'no_show'].includes(status)
      );

    if (!allowed) {
      throw new Error('Alteração de status não permitida.');
    }

    await updateDoc(this.appointmentRef(appointment.id), {
      status,
      updatedAt: serverTimestamp()
    });
  }

  async cancel(appointmentId: string): Promise<void> {
    this.currentUid();

    const reference = this.appointmentRef(appointmentId);

    await runTransaction(firestore, async transaction => {
      const appointment = await transaction.get(reference);

      if (!appointment.exists()) {
        throw new Error('Consulta não encontrada.');
      }

      const data = appointment.data() as Omit<
        Appointment,
        'id'
      >;

      if (!['scheduled', 'confirmed'].includes(data.status)) {
        throw new Error('Esta consulta não pode ser cancelada.');
      }

      const slotRef = this.slotRef(data.slotId);
      const slot = await transaction.get(slotRef);

      if (
        !slot.exists() ||
        slot.data()['active'] !== true ||
        slot.data()['appointmentId'] !== appointmentId
      ) {
        throw new Error('Reserva de horário inconsistente.');
      }

      transaction.update(reference, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      transaction.update(slotRef, {
        active: false,
        updatedAt: serverTimestamp()
      });
    });
  }

  async reschedule(
    appointmentId: string,
    date: string,
    startTime: string
  ): Promise<void> {
    this.currentUid();

    if (!validAppointmentTime(date, startTime)) {
      throw new Error('Novo horário inválido.');
    }

    const reference = this.appointmentRef(appointmentId);

    await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);

      if (!snapshot.exists()) {
        throw new Error('Consulta não encontrada.');
      }

      const appointment = snapshot.data() as Omit<
        Appointment,
        'id'
      >;

      if (!['scheduled', 'confirmed'].includes(appointment.status)) {
        throw new Error('Consulta não pode ser reagendada.');
      }

      const newSlotId = appointmentSlotId(
        appointment.professionalId,
        date,
        startTime
      );

      if (newSlotId === appointment.slotId) {
        throw new Error('Selecione um horário diferente.');
      }

      const oldSlotRef = this.slotRef(appointment.slotId);
      const newSlotRef = this.slotRef(newSlotId);

      // Todas as leituras acontecem antes das gravações.
      const oldSlot = await transaction.get(oldSlotRef);
      const newSlot = await transaction.get(newSlotRef);

      if (
        !oldSlot.exists() ||
        oldSlot.data()['active'] !== true ||
        oldSlot.data()['appointmentId'] !== appointmentId
      ) {
        throw new Error('Reserva original inconsistente.');
      }

      if (
        newSlot.exists() &&
        newSlot.data()['active'] === true
      ) {
        throw new Error('Novo horário já está ocupado.');
      }

      transaction.update(reference, {
        date,
        startTime,
        slotId: newSlotId,
        status: 'scheduled',
        updatedAt: serverTimestamp()
      });

      transaction.update(oldSlotRef, {
        active: false,
        updatedAt: serverTimestamp()
      });

      const newSlotData = {
        appointmentId,
        professionalId: appointment.professionalId,
        date,
        startTime,
        active: true,
        updatedAt: serverTimestamp()
      };

      if (newSlot.exists()) {
        transaction.update(newSlotRef, newSlotData);
      } else {
        transaction.set(newSlotRef, {
          ...newSlotData,
          createdAt: serverTimestamp()
        });
      }
    });
  }
}
