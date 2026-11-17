
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

export type DocumentStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'signed';

export type SignatureMethod =
  | 'drawn'
  | 'govbr_advanced'
  | 'icp_brasil_qualified';

export interface DocumentDetails {
  purpose?: string;
  requestedBy?: string;
  attendancePeriod?: string;
  demand?: string;
  procedure?: string;
  analysis?: string;
  conclusion?: string;
  recommendations?: string;
  professionalsInvolved?: string;
  methods?: string;
  results?: string;
  question?: string;
  foundation?: string;
  destination?: string;
  referralReason?: string;
  diagnosis?: string;
  evidence?: string;
}

export interface DocumentSignature {
  method: SignatureMethod;
  signerUid: string;
  signerName: string;
  signerCrp: string;
  signedAt: Timestamp;
  contentHash: string;
  externalReference: string;
  signatureImageDataUrl?: string;
  signatureImagePath?: string;
  signatureImageUrl?: string;
}

export interface DocumentInput {
  type: PsychologicalDocumentType;
  title: string;
  content: string;
  documentDate: string;
  details: DocumentDetails;
}

export interface PsychologicalDocument
  extends Omit<DocumentInput, 'details'> {
  id: string;

  patientName: string;
  patientBirthDate: string;

  professionalId: string;
  professionalName: string;
  professionalCrp: string;

  status: DocumentStatus;

  details?: DocumentDetails;
  version?: number;
  versionId?: string;
  lastAuditId?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  reviewComment?: string;
  signature?: DocumentSignature;

  createdBy: string;
  updatedBy: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DocumentVersion {
  id: string;
  version: number;
  documentId: string;
  snapshot: DocumentInput;
  createdBy: string;
  createdAt: Timestamp;
}

export type DocumentAuditAction =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'signed';

export interface DocumentAuditEntry {
  id: string;
  action: DocumentAuditAction;
  version: number;
  actorUid: string;
  actorName: string;
  comment?: string;
  createdAt: Timestamp;
}

export function emptyDocumentDetails(): DocumentDetails {
  return {
    purpose: '',
    requestedBy: '',
    attendancePeriod: '',
    demand: '',
    procedure: '',
    analysis: '',
    conclusion: '',
    recommendations: '',
    professionalsInvolved: '',
    methods: '',
    results: '',
    question: '',
    foundation: '',
    destination: '',
    referralReason: '',
    diagnosis: '',
    evidence: ''
  };
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
