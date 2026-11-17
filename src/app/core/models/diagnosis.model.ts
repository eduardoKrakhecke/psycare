
import type { Timestamp } from 'firebase/firestore';

export type DiagnosisAssessment =
  | 'hypothesis'
  | 'confirmed';

export interface DiagnosisInput {
  code: string;
  description: string;
  classification: 'CID-10';
  assessment: DiagnosisAssessment;
  assessmentDate: string;
}

export interface Diagnosis extends DiagnosisInput {
  id: string;
  authorUid: string;
  createdAt: Timestamp;
}

export interface CidOption {
  code: string;
  description: string;
}

// Catálogo reduzido apenas para testes.
// Antes de usar clinicamente, carregar a tabela oficial completa.
