
import type { Timestamp } from 'firebase/firestore';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface AppointmentInput {
  patientId: string;
  professionalId: string;
  date: string;
  startTime: string;
}

export interface Appointment extends AppointmentInput {
  id: string;
  slotId: string;
  status: AppointmentStatus;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BookedSlot {
  appointmentId: string;
  professionalId: string;
  date: string;
  startTime: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const APPOINTMENT_STATUSES: Record<
  AppointmentStatus,
  string
> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  no_show: 'Não compareceu',
  cancelled: 'Cancelada'
};

export function appointmentSlotId(
  professionalId: string,
  date: string,
  startTime: string
): string {
  return `${professionalId}_${date}_${startTime}`;
}

export function appointmentEndTime(startTime: string): string {
  const hour = Number(startTime.slice(0, 2)) + 1;

  return `${String(hour).padStart(2, '0')}:00`;
}

export function validAppointmentTime(
  date: string,
  time: string
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^(08|09|10|11|12|13|14|15|16|17):00$/.test(time)
  ) {
    return false;
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }

  const weekday = parsed.getDay();

  return weekday >= 1 && weekday <= 5;
}
