
import type { Timestamp } from 'firebase/firestore';

export interface PatientInput {
  fullName: string;
  birthDate: string;
  cpf: string;
  phone: string;
  email: string;
  contactName: string;
  contactPhone: string;
  professionalId: string;
  active: boolean;
}

export interface Patient extends PatientInput {
  id: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
