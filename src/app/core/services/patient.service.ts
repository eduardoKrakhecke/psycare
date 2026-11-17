
import { Injectable } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import { firestore, firebaseAuth }
  from '../firebase/firebase';

import { environment }
  from '../../../environments/environment';

import type {
  Patient,
  PatientInput
} from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class PatientService {

  private readonly path = [
    'clinics',
    environment.clinicId,
    'patients'
  ] as const;

  async list(): Promise<Patient[]> {
    const reference = collection(
      firestore,
      ...this.path
    );

    const snapshot = await getDocs(
      query(reference, limit(100))
    );

    return snapshot.docs
      .map(item => ({
        ...(item.data() as Omit<Patient, 'id'>),
        id: item.id
      }))
      .sort((a, b) =>
        a.fullName.localeCompare(
          b.fullName,
          'pt-BR'
        )
      );
  }

  async create(input: PatientInput): Promise<string> {
    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }

    const reference = doc(
      collection(firestore, ...this.path)
    );

    await setDoc(reference, {
      ...input,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return reference.id;
  }

  async update(
    id: string,
    input: PatientInput
  ): Promise<void> {
    const reference = doc(
      firestore,
      ...this.path,
      id
    );

    await updateDoc(reference, {
      ...input,
      updatedAt: serverTimestamp()
    });
  }

  async setActive(
    id: string,
    active: boolean
  ): Promise<void> {
    const reference = doc(
      firestore,
      ...this.path,
      id
    );

    await updateDoc(reference, {
      active,
      updatedAt: serverTimestamp()
    });
  }
}
