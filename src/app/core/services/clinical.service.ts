
import { Injectable, inject } from '@angular/core';

import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';

import { MemberService } from '../auth/member.service';

import { environment }
  from '../../../environments/environment';

import type { ClinicMember }
  from '../models/member.model';

import type { Patient }
  from '../models/patient.model';

import type {
  ClinicalRecord,
  ClinicalRecordInput
} from '../models/clinical-record.model';

import type {
  Assessment,
  AssessmentInput
} from '../models/assessment.model';

import type {
  Diagnosis,
  DiagnosisInput
} from '../models/diagnosis.model';

@Injectable({ providedIn: 'root' })
export class ClinicalService {
  private readonly members = inject(MemberService);

  private readonly base = [
    'clinics',
    environment.clinicId,
    'patients'
  ] as const;

  private currentUid(): string {
    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }

    return uid;
  }

  private authorizedMember(): ClinicMember {
    this.currentUid();

    const member = this.members.currentMember();

    if (
      !member?.active ||
      !['admin', 'psychologist'].includes(member.role)
    ) {
      throw new Error('Acesso clínico não autorizado.');
    }

    return member;
  }

  private patientsRef() {
    return collection(
      firestore,
      ...this.base
    );
  }

  private subcollection(
    patientId: string,
    name: 'clinicalRecords' | 'assessments' | 'diagnoses'
  ) {
    return collection(
      firestore,
      ...this.base,
      patientId,
      name
    );
  }

  async listPatients(): Promise<Patient[]> {
    const member = this.authorizedMember();

    const reference = member.role === 'admin'
      ? query(
        this.patientsRef(),
        limit(100)
      )
      : query(
        this.patientsRef(),
        where(
          'professionalId',
          '==',
          member.professionalId || '__unassigned__'
        ),
        limit(100)
      );

    const snapshot = await getDocs(reference);

    return snapshot.docs
      .map(item => ({
        ...(item.data() as Omit<Patient, 'id'>),
        id: item.id
      }))
      .sort((a, b) =>
        a.fullName.localeCompare(b.fullName, 'pt-BR')
      );
  }

  private async listDocuments<T>(
    patientId: string,
    collectionName:
      'clinicalRecords' | 'assessments' | 'diagnoses'
  ): Promise<T[]> {
    const member = this.authorizedMember();
    const uid = this.currentUid();

    const reference = this.subcollection(
      patientId,
      collectionName
    );

    const securedQuery = member.role === 'admin'
      ? query(reference, limit(100))
      : query(
        reference,
        where('authorUid', '==', uid),
        limit(100)
      );

    const snapshot = await getDocs(securedQuery);

    return snapshot.docs.map(item => ({
      ...item.data(),
      id: item.id
    })) as T[];
  }

  async listRecords(
    patientId: string
  ): Promise<ClinicalRecord[]> {
    const records =
      await this.listDocuments<ClinicalRecord>(
        patientId,
        'clinicalRecords'
      );

    return records.sort((a, b) =>
      b.sessionDate.localeCompare(a.sessionDate)
    );
  }

  async listAssessments(
    patientId: string
  ): Promise<Assessment[]> {
    const assessments =
      await this.listDocuments<Assessment>(
        patientId,
        'assessments'
      );

    return assessments.sort((a, b) =>
      b.assessmentDate.localeCompare(a.assessmentDate)
    );
  }

  async listDiagnoses(
    patientId: string
  ): Promise<Diagnosis[]> {
    const diagnoses =
      await this.listDocuments<Diagnosis>(
        patientId,
        'diagnoses'
      );

    return diagnoses.sort((a, b) =>
      b.assessmentDate.localeCompare(a.assessmentDate)
    );
  }

  private async createDocument(
    patientId: string,
    collectionName:
      'clinicalRecords' | 'assessments' | 'diagnoses',
    input: Record<string, unknown>
  ): Promise<string> {
    this.authorizedMember();

    const uid = this.currentUid();

    const reference = await addDoc(
      this.subcollection(patientId, collectionName),
      {
        ...input,
        authorUid: uid,
        createdAt: serverTimestamp()
      }
    );

    return reference.id;
  }

  createRecord(
    patientId: string,
    input: ClinicalRecordInput
  ): Promise<string> {
    return this.createDocument(
      patientId,
      'clinicalRecords',
      { ...input }
    );
  }

  createAssessment(
    patientId: string,
    input: AssessmentInput
  ): Promise<string> {
    return this.createDocument(
      patientId,
      'assessments',
      { ...input }
    );
  }

  createDiagnosis(
    patientId: string,
    input: DiagnosisInput
  ): Promise<string> {
    return this.createDocument(
      patientId,
      'diagnoses',
      { ...input }
    );
  }
}
