
import { Injectable } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
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
        active: item.data()['active'] === true
      } as ClinicMember))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      );
  }

  async updateOperationalAccess(
    uid: string,
    role: OperationalRole,
    active: boolean
  ): Promise<void> {
    const ref = doc(firestore, ...this.path, uid);

    await updateDoc(ref, {
      role,
      active
    });
  }
}
