
import type { Timestamp } from 'firebase/firestore';

export interface ClinicalRecordInput {
  sessionDate: string;
  summary: string;
  objectives: string;
}

export interface ClinicalRecord extends ClinicalRecordInput {
  id: string;
  authorUid: string;
  createdAt: Timestamp;
}
