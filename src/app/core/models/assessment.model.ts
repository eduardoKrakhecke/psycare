
import type { Timestamp } from 'firebase/firestore';

export type AssessmentType =
  | 'initial'
  | 'follow_up'
  | 'other';

export interface AssessmentInput {
  assessmentDate: string;
  type: AssessmentType;
  objective: string;
  method: string;
  observations: string;
  conclusion: string;
}

export interface Assessment extends AssessmentInput {
  id: string;
  authorUid: string;
  createdAt: Timestamp;
}
