
import { Injectable } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { environment } from '../../../environments/environment';

import type {
  ClinicMember,
  OperationalRole
} from '../models/member.model';

@Injectable({ providedIn: 'root' })
export class MemberAdminService {
  private readonly path = [
    'clinics',
    environment.clinicId,
    'members'
  ] as const;

  async list(): Promise<ClinicMember[]> {
    const snapshot = await getDocs(
      query(
        collection(firestore, ...this.path),
        limit(100)
      )
    );

    return snapshot.docs
      .map(item => ({
        uid: item.id,
        name: String(item.data()['name'] ?? ''),
        role: item.data()['role'],
        active: item.data()['active'] === true,
        professionalId: String(
          item.data()['professionalId'] ?? ''
        )
      } as ClinicMember))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      );
  }

  async createMembership(
    uid: string,
    name: string,
    role: OperationalRole,
    professionalId: string
  ): Promise<void> {
    const reference = doc(firestore, ...this.path, uid);

    await setDoc(reference, {
      name,
      role,
      active: true,
      professionalId:
        role === 'psychologist' ? professionalId : ''
    });
  }

  async updateOperationalAccess(
    uid: string,
    role: OperationalRole,
    active: boolean,
    professionalId: string
  ): Promise<void> {
    const reference = doc(firestore, ...this.path, uid);

    await updateDoc(reference, {
      role,
      active,
      professionalId:
        role === 'psychologist' ? professionalId : ''
    });
  }
}
