
import { Injectable, signal } from '@angular/core';

import {
  doc,
  getDocFromServer
} from 'firebase/firestore';

import {
  firebaseAuth,
  firestore
} from '../firebase/firebase';

import { environment }
  from '../../../environments/environment';

import type {
  ClinicMember,
  UserRole
} from '../models/member.model';

@Injectable({
  providedIn: 'root'
})
export class MemberService {
  private readonly memberState =
    signal<ClinicMember | null>(null);

  readonly currentMember =
    this.memberState.asReadonly();

  clear(): void {
    this.memberState.set(null);
  }

  async refresh(): Promise<ClinicMember | null> {
    await firebaseAuth.authStateReady();

    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      this.clear();
      return null;
    }

    const reference = doc(
      firestore,
      'clinics',
      environment.clinicId,
      'members',
      uid
    );

    const snapshot = await getDocFromServer(reference);
    const data = snapshot.data();

    if (
      !snapshot.exists() ||
      !data ||
      data['active'] !== true ||
      !['admin', 'psychologist', 'receptionist']
        .includes(data['role'])
    ) {
      this.clear();
      return null;
    }

    const role = data['role'] as UserRole;

    const professionalId =
      typeof data['professionalId'] === 'string'
        ? data['professionalId']
        : undefined;

    const member: ClinicMember = {
      uid,
      name: String(data['name'] ?? ''),
      role,
      active: true,
      professionalId
    };

    this.memberState.set(member);
    return member;
  }

  isAdmin(): boolean {
    return this.currentMember()?.role === 'admin';
  }

  canAccessClinical(): boolean {
    const role = this.currentMember()?.role;

    return role === 'admin' || role === 'psychologist';
  }
}
