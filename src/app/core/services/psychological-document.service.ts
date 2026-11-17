import { Injectable, inject } from '@angular/core';

import {
  collection,
  deleteField,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';

import { MemberService } from '../auth/member.service';

import { environment }
  from '../../../environments/environment';

import type { Patient } from '../models/patient.model';
import type { Professional } from '../models/professional.model';

import {
  DOCUMENT_TYPES,
  emptyDocumentDetails,
  type DocumentAuditAction,
  type DocumentAuditEntry,
  type DocumentInput,
  type DocumentStatus,
  type DocumentVersion,
  type PsychologicalDocument,
  type SignatureMethod,
  validDocumentDate
} from '../models/psychological-document.model';

@Injectable({
  providedIn: 'root'
})
export class PsychologicalDocumentService {
  private readonly members = inject(MemberService);

  private readonly base = [
    'clinics',
    environment.clinicId,
    'patients'
  ] as const;

  private documentsRef(patientId: string) {
    return collection(
      firestore,
      ...this.base,
      patientId,
      'documents'
    );
  }

  private documentRef(patientId: string, documentId: string) {
    return doc(this.documentsRef(patientId), documentId);
  }

  private versionsRef(patientId: string, documentId: string) {
    return collection(
      this.documentRef(patientId, documentId),
      'versions'
    );
  }

  private auditRef(patientId: string, documentId: string) {
    return collection(
      this.documentRef(patientId, documentId),
      'audit'
    );
  }

  private authorize(): string {
    const uid = firebaseAuth.currentUser?.uid;
    const member = this.members.currentMember();

    if (
      !uid ||
      !member?.active ||
      !['admin', 'psychologist'].includes(member.role)
    ) {
      throw new Error('Acesso aos documentos nao autorizado.');
    }

    return uid;
  }

  private validate(input: DocumentInput): void {
    const types = DOCUMENT_TYPES.map(item => item.value);
    const requiredFields: Record<string, string[]> = {
      declaration: ['purpose'],
      certificate: ['purpose', 'attendancePeriod'],
      report: [
        'demand', 'procedure', 'analysis',
        'conclusion', 'recommendations'
      ],
      multi_report: [
        'demand', 'professionalsInvolved', 'procedure',
        'analysis', 'conclusion'
      ],
      evaluation_report: [
        'demand', 'methods', 'results',
        'analysis', 'conclusion', 'recommendations'
      ],
      opinion: ['question', 'foundation', 'conclusion'],
      referral: [
        'destination', 'referralReason', 'recommendations'
      ],
      diagnosis: ['diagnosis', 'evidence', 'recommendations'],
      other: ['purpose', 'conclusion']
    };

    const fields = input.details ?? {};

    if (
      !types.includes(input.type) ||
      input.title.trim().length < 3 ||
      input.title.trim().length > 120 ||
      input.content.trim().length < 10 ||
      input.content.length > 20000 ||
      !validDocumentDate(input.documentDate) ||
      !fields ||
      !requiredFields[input.type].every(field =>
        String(fields[field as keyof typeof fields] ?? '')
          .trim().length >= 3
      )
    ) {
      throw new Error(
        'Preencha os campos obrigatorios da modalidade ' +
        'e confira titulo, texto e data.'
      );
    }
  }

  private snapshotFrom(
    document: PsychologicalDocument
  ): DocumentInput {
    return {
      type: document.type,
      title: document.title,
      content: document.content,
      documentDate: document.documentDate,
      details: document.details ?? emptyDocumentDetails()
    };
  }

  private actorName(): string {
    return this.members.currentMember()?.name ?? 'Usuario';
  }

  private nextVersion(document: PsychologicalDocument): number {
    return (document.version ?? 0) + 1;
  }

  private async contentHash(
    input: DocumentInput,
    version: number
  ): Promise<string> {
    const payload = JSON.stringify({ ...input, version });
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
      .map(value => value.toString(16).padStart(2, '0'))
      .join('');
  }

  private writeVersionAndAudit(
    batch: ReturnType<typeof writeBatch>,
    patientId: string,
    documentId: string,
    input: DocumentInput,
    version: number,
    action: DocumentAuditAction,
    uid: string,
    comment = ''
  ): { versionId: string; auditId: string } {
    const versionId = `v${version}`;
    const auditId = versionId;

    batch.set(
      doc(this.versionsRef(patientId, documentId), versionId),
      {
        documentId,
        version,
        snapshot: input,
        createdBy: uid,
        createdAt: serverTimestamp()
      }
    );

    batch.set(
      doc(this.auditRef(patientId, documentId), auditId),
      {
        action,
        version,
        actorUid: uid,
        actorName: this.actorName(),
        comment: comment.trim(),
        createdAt: serverTimestamp()
      }
    );

    return { versionId, auditId };
  }

  async list(patientId: string): Promise<PsychologicalDocument[]> {
    this.authorize();

    const member = this.members.currentMember()!;
    const reference = this.documentsRef(patientId);
    const securedQuery = member.role === 'admin'
      ? query(reference, limit(100))
      : query(
        reference,
        where('professionalId', '==', member.professionalId!),
        limit(100)
      );

    const snapshot = await getDocs(securedQuery);

    return snapshot.docs.map(item => ({
      ...(item.data() as Omit<PsychologicalDocument, 'id'>),
      id: item.id
    })).sort((a, b) =>
      b.documentDate.localeCompare(a.documentDate)
    );
  }

  async getById(
    patientId: string,
    documentId: string
  ): Promise<PsychologicalDocument> {
    this.authorize();

    const snapshot = await getDocFromServer(
      this.documentRef(patientId, documentId)
    );

    if (!snapshot.exists()) {
      throw new Error('Documento nao encontrado.');
    }

    return {
      ...(snapshot.data() as Omit<PsychologicalDocument, 'id'>),
      id: snapshot.id
    };
  }

  async listVersions(
    patientId: string,
    documentId: string
  ): Promise<DocumentVersion[]> {
    this.authorize();

    const snapshot = await getDocs(
      query(this.versionsRef(patientId, documentId), limit(100))
    );

    return snapshot.docs.map(item => ({
      ...(item.data() as Omit<DocumentVersion, 'id'>),
      id: item.id
    })).sort((a, b) => b.version - a.version);
  }

  async listAudit(
    patientId: string,
    documentId: string
  ): Promise<DocumentAuditEntry[]> {
    this.authorize();

    const snapshot = await getDocs(
      query(this.auditRef(patientId, documentId), limit(100))
    );

    return snapshot.docs.map(item => ({
      ...(item.data() as Omit<DocumentAuditEntry, 'id'>),
      id: item.id
    })).sort((a, b) => b.version - a.version);
  }

  async create(
    patient: Patient,
    professional: Professional,
    input: DocumentInput
  ): Promise<string> {
    const uid = this.authorize();
    const member = this.members.currentMember()!;

    this.validate(input);

    if (!patient.active || !professional.active) {
      throw new Error(
        'Paciente e profissional precisam estar ativos.'
      );
    }

    if (
      member.role === 'psychologist' &&
      (
        member.professionalId !== professional.id ||
        patient.professionalId !== professional.id
      )
    ) {
      throw new Error(
        'O paciente nao esta vinculado ao profissional.'
      );
    }

    const reference = doc(this.documentsRef(patient.id));
    const batch = writeBatch(firestore);
    const audit = this.writeVersionAndAudit(
      batch,
      patient.id,
      reference.id,
      input,
      1,
      'created',
      uid
    );

    batch.set(reference, {
      ...input,
      patientName: patient.fullName,
      patientBirthDate: patient.birthDate,
      professionalId: professional.id,
      professionalName: professional.fullName,
      professionalCrp: professional.crp,
      status: 'draft',
      version: 1,
      versionId: audit.versionId,
      lastAuditId: audit.auditId,
      createdBy: uid,
      updatedBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
    return reference.id;
  }

  async update(
    patientId: string,
    documentId: string,
    input: DocumentInput
  ): Promise<void> {
    const uid = this.authorize();
    this.validate(input);

    const existing = await this.getById(patientId, documentId);

    if (!['draft', 'rejected'].includes(existing.status)) {
      throw new Error(
        'Somente rascunhos ou documentos rejeitados podem ser editados.'
      );
    }

    if (existing.type !== input.type) {
      throw new Error(
        'O tipo nao pode ser alterado apos o cadastro.'
      );
    }

    const version = this.nextVersion(existing);
    const batch = writeBatch(firestore);
    const audit = this.writeVersionAndAudit(
      batch,
      patientId,
      documentId,
      input,
      version,
      'updated',
      uid
    );

    batch.update(this.documentRef(patientId, documentId), {
      ...input,
      status: 'draft',
      version,
      versionId: audit.versionId,
      lastAuditId: audit.auditId,
      reviewedBy: deleteField(),
      reviewedAt: deleteField(),
      reviewComment: deleteField(),
      signature: deleteField(),
      updatedBy: uid,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }

  async submitForReview(
    patientId: string,
    documentId: string
  ): Promise<void> {
    await this.transition(
      patientId,
      documentId,
      'in_review',
      'submitted'
    );
  }

  async review(
    patientId: string,
    documentId: string,
    approved: boolean,
    comment: string
  ): Promise<void> {
    const existing = await this.getById(patientId, documentId);

    if (existing.status !== 'in_review') {
      throw new Error('O documento nao esta aguardando revisao.');
    }

    await this.transition(
      patientId,
      documentId,
      approved ? 'approved' : 'rejected',
      approved ? 'approved' : 'rejected',
      comment
    );
  }

  async registerSignature(
    patientId: string,
    documentId: string,
    method: SignatureMethod,
    externalReference: string
  ): Promise<void> {
    const uid = this.authorize();
    const existing = await this.getById(patientId, documentId);

    if (!['approved', 'signed'].includes(existing.status)) {
      throw new Error(
        'Somente documentos aprovados ou assinados podem ser assinados.'
      );
    }

    if (externalReference.trim().length < 4) {
      throw new Error(
        'Informe a referencia do documento assinado externamente.'
      );
    }

    const version = this.nextVersion(existing);
    const input = this.snapshotFrom(existing);
    const hash = await this.contentHash(input, version);
    const batch = writeBatch(firestore);
    const audit = this.writeVersionAndAudit(
      batch,
      patientId,
      documentId,
      input,
      version,
      'signed',
      uid,
      externalReference
    );

    batch.update(this.documentRef(patientId, documentId), {
      status: 'signed',
      version,
      versionId: audit.versionId,
      lastAuditId: audit.auditId,
      signature: {
        method,
        signerUid: uid,
        signerName: this.actorName(),
        signerCrp: existing.professionalCrp,
        signedAt: Timestamp.now(),
        contentHash: hash,
        externalReference: externalReference.trim()
      },
      updatedBy: uid,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }

  async registerDrawnSignature(
    patientId: string,
    documentId: string,
    signatureDataUrl: string
  ): Promise<void> {
    const uid = this.authorize();
    const existing = await this.getById(patientId, documentId);

    if (!['approved', 'signed'].includes(existing.status)) {
      throw new Error(
        'Somente documentos aprovados ou assinados podem ser assinados.'
      );
    }

    if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(signatureDataUrl)) {
      throw new Error('A assinatura desenhada é inválida.');
    }

    if (signatureDataUrl.length > 580000) {
      throw new Error(
        'A imagem da assinatura ficou muito grande. Desenhe uma assinatura mais simples.'
      );
    }

    const version = this.nextVersion(existing);
    const input = this.snapshotFrom(existing);
    const hash = await this.contentHash(input, version);
    const batch = writeBatch(firestore);
    const audit = this.writeVersionAndAudit(
      batch,
      patientId,
      documentId,
      input,
      version,
      'signed',
      uid,
      'Assinatura desenhada registrada no PsyCare.'
    );

    batch.update(this.documentRef(patientId, documentId), {
      status: 'signed',
      version,
      versionId: audit.versionId,
      lastAuditId: audit.auditId,
      signature: {
        method: 'drawn',
        signerUid: uid,
        signerName: this.actorName(),
        signerCrp: existing.professionalCrp,
        signedAt: Timestamp.now(),
        contentHash: hash,
        externalReference: `psycare-drawn-v${version}`,
        signatureImageDataUrl: signatureDataUrl
      },
      updatedBy: uid,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }

  private async transition(
    patientId: string,
    documentId: string,
    status: DocumentStatus,
    action: Extract<
      DocumentAuditAction,
      'submitted' | 'approved' | 'rejected'
    >,
    comment = ''
  ): Promise<void> {
    const uid = this.authorize();
    const existing = await this.getById(patientId, documentId);
    const allowed = action === 'submitted'
      ? ['draft', 'rejected'].includes(existing.status)
      : existing.status === 'in_review';

    if (!allowed) {
      throw new Error('Transicao de revisao invalida.');
    }

    const version = this.nextVersion(existing);
    const batch = writeBatch(firestore);
    const audit = this.writeVersionAndAudit(
      batch,
      patientId,
      documentId,
      this.snapshotFrom(existing),
      version,
      action,
      uid,
      comment
    );

    batch.update(this.documentRef(patientId, documentId), {
      status,
      version,
      versionId: audit.versionId,
      lastAuditId: audit.auditId,
      reviewComment: comment.trim(),
      reviewedBy: uid,
      reviewedAt: serverTimestamp(),
      updatedBy: uid,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }
}
