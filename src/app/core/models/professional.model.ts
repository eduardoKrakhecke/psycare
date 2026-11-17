
import type { Timestamp } from 'firebase/firestore';

export interface ProfessionalInput {
  fullName: string;
  crp: string;
  email: string;
  phone: string;
  specialties: string[];
  active: boolean;
}

export interface Professional extends ProfessionalInput {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
