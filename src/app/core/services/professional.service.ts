
import { Injectable, inject } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  getDocFromServer,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { environment } from '../../../environments/environment';

import { MemberService }
  from '../auth/member.service';

import type {
  Professional,
  ProfessionalInput
} from '../models/professional.model';

@Injectable({ providedIn: 'root' })
export class ProfessionalService {
  private readonly members = inject(MemberService);

  private readonly path = [
    'clinics',
    environment.clinicId,
    'professionals'
  ] as const;

  async getById(id: string): Promise<Professional | null> {
    const reference = doc(
      firestore,
      ...this.path,
      id
    );

    const snapshot = await getDocFromServer(reference);

    if (!snapshot.exists()) {
      return null;
    }

    return {
      ...(snapshot.data() as Omit<Professional, 'id'>),
      id: snapshot.id
    };
  }

  async list(): Promise<Professional[]> {
    const member = this.members.currentMember();

    if (member?.professionalId) {
      const professional = await this.getById(
        member.professionalId
      );

      if (professional) {
        return [professional];
      }

      // Permite ao administrador corrigir um vínculo antigo,
      // removido ou ainda não migrado no ambiente de produção.
      if (member.role !== 'admin') {
        return [];
      }
    }

    const ref = collection(firestore, ...this.path);

    const snapshot = await getDocs(
      query(ref, limit(100))
    );

    return snapshot.docs
      .map(item => ({
        ...(item.data() as Omit<Professional, 'id'>),
        id: item.id
      }))
      .sort((a, b) =>
        a.fullName.localeCompare(b.fullName, 'pt-BR')
      );
  }

  async create(input: ProfessionalInput): Promise<void> {
    const ref = doc(
      collection(firestore, ...this.path)
    );

    await setDoc(ref, {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async update(
    id: string,
    input: ProfessionalInput
  ): Promise<void> {
    const ref = doc(firestore, ...this.path, id);

    await updateDoc(ref, {
      ...input,
      updatedAt: serverTimestamp()
    });
  }

  async setActive(
    id: string,
    active: boolean
  ): Promise<void> {
    const ref = doc(firestore, ...this.path, id);

    await updateDoc(ref, {
      active,
      updatedAt: serverTimestamp()
    });
  }
}
