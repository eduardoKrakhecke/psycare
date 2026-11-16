import { Injectable, signal } from '@angular/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
  type UserCredential
} from 'firebase/auth';
import { firebaseAuth } from '../firebase/firebase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly currentUser = signal<User | null>(firebaseAuth.currentUser);

  constructor() {
    onAuthStateChanged(firebaseAuth, user => {
      this.currentUser.set(user);
    });
  }

  login(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  logout(): Promise<void> {
    return signOut(firebaseAuth);
  }
}
