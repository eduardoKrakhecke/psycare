
import { Injectable, inject } from '@angular/core';

import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
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
  type DocumentInput,
  type PsychologicalDocument,
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
    return doc(
      this.documentsRef(patientId),
      documentId
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
      throw new Error('Acesso aos documentos não autorizado.');
    }

    return uid;
  }

  private validate(input: DocumentInput): void {
    const types = DOCUMENT_TYPES.map(item => item.value);

    if (
      !types.includes(input.type) ||
      input.title.trim().length < 3 ||
      input.title.trim().length > 120 ||
      input.content.trim().length < 10 ||
      input.content.length > 20000 ||
      !validDocumentDate(input.documentDate)
    ) {
      throw new Error(
        'Verifique o tipo, título (3 a 120 caracteres), ' +
        'texto (10 a 20.000 caracteres) e data.'
      );
    }
  }

  async list(patientId: string): Promise<PsychologicalDocument[]> {
    this.authorize();

    const member = this.members.currentMember()!;

    if (
      member.role === 'psychologist' &&
      !member.professionalId
    ) {
      throw new Error('Psicólogo sem vínculo profissional.');
    }

    const reference = this.documentsRef(patientId);

    const securedQuery = member.role === 'admin'
      ? query(reference, limit(100))
      : query(
        reference,
        where(
          'professionalId',
          '==',
          member.professionalId!
        ),
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
      throw new Error('Documento não encontrado.');
    }

    return {
      ...(snapshot.data() as Omit<PsychologicalDocument, 'id'>),
      id: snapshot.id
    };
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
        'O paciente não está vinculado ao profissional.'
      );
    }

    const reference = doc(
      this.documentsRef(patient.id)
    );

    await setDoc(reference, {
      type: input.type,
      title: input.title.trim(),
      content: input.content.trim(),
      documentDate: input.documentDate,

      patientName: patient.fullName,
      patientBirthDate: patient.birthDate,

      professionalId: professional.id,
      professionalName: professional.fullName,
      professionalCrp: professional.crp,

      status: 'draft',

      createdBy: uid,
      updatedBy: uid,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return reference.id;
  }

  async update(
    patientId: string,
    documentId: string,
    input: DocumentInput
  ): Promise<void> {
    const uid = this.authorize();

    this.validate(input);

    const existing = await this.getById(
      patientId,
      documentId
    );

    if (existing.status !== 'draft') {
      throw new Error(
        'Somente rascunhos podem ser modificados.'
      );
    }

    if (existing.type !== input.type) {
      throw new Error(
        'O tipo não pode ser alterado após o cadastro.'
      );
    }

    await updateDoc(
      this.documentRef(patientId, documentId),
      {
        title: input.title.trim(),
        content: input.content.trim(),
        documentDate: input.documentDate,
        updatedBy: uid,
        updatedAt: serverTimestamp()
      }
    );
  }
}
