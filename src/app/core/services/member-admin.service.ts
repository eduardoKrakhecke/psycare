
import { Injectable, inject } from '@angular/core';

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';
import { environment } from '../../../environments/environment';

import type {
  ClinicMember,
  OperationalRole
} from '../models/member.model';

import { MemberService }
  from '../auth/member.service';

@Injectable({ providedIn: 'root' })
export class MemberAdminService {
  private readonly members = inject(MemberService);

  private readonly path = [
    'clinics',
    environment.clinicId,
    'members'
  ] as const;

  async list(): Promise<ClinicMember[]> {
    const member = this.members.currentMember();
    const reference = collection(firestore, ...this.path);
    const membersQuery = member?.professionalId
      ? query(
        reference,
        where(
          'professionalId',
          '==',
          member.professionalId
        ),
        limit(100)
      )
      : query(reference, limit(100));

    const snapshot = await getDocs(
      membersQuery
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
      professionalId
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
      professionalId
    });
  }

  async updateOwnerProfessional(
    professionalId: string
  ): Promise<void> {
    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }

    await updateDoc(doc(firestore, ...this.path, uid), {
      professionalId
    });
  }
}
