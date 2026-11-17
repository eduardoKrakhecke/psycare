
import type { Timestamp } from 'firebase/firestore';

export const DOCUMENT_TYPES = [
  { value: 'declaration', label: 'Declaração' },
  { value: 'certificate', label: 'Atestado Psicológico' },
  { value: 'report', label: 'Relatório Psicológico' },
  { value: 'multi_report', label: 'Relatório Multiprofissional' },
  { value: 'evaluation_report', label: 'Laudo Psicológico' },
  { value: 'opinion', label: 'Parecer Psicológico' },
  { value: 'referral', label: 'Encaminhamento' },
  { value: 'diagnosis', label: 'Registro de Diagnóstico' },
  { value: 'other', label: 'Outro documento' }
] as const;

export type PsychologicalDocumentType =
  (typeof DOCUMENT_TYPES)[number]['value'];

export interface DocumentInput {
  type: PsychologicalDocumentType;
  title: string;
  content: string;
  documentDate: string;
}

export interface PsychologicalDocument extends DocumentInput {
  id: string;

  patientName: string;
  patientBirthDate: string;

  professionalId: string;
  professionalName: string;
  professionalCrp: string;

  status: 'draft';

  createdBy: string;
  updatedBy: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function documentTypeLabel(
  type: PsychologicalDocumentType
): string {
  return DOCUMENT_TYPES.find(
    item => item.value === type
  )?.label ?? 'Documento';
}

export function localDocumentDate(): string {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function validDocumentDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    year >= 1900 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    value <= localDocumentDate()
  );
}
