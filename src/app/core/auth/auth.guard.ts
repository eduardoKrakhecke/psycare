import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { firebaseAuth, firestore } from '../firebase/firebase';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  await firebaseAuth.authStateReady();

  const user = firebaseAuth.currentUser;
  if (!user) return router.createUrlTree(['/login']);

  try {
    const memberRef = doc(
      firestore,
      'clinics',
      environment.clinicId,
      'members',
      user.uid
    );
    const member = await getDoc(memberRef);

    if (member.exists() && member.data()['active'] === true) {
      return true;
    }

    await signOut(firebaseAuth);
    return router.createUrlTree(['/login'], {
      queryParams: { reason: 'access-denied' }
    });
  } catch {
    return router.createUrlTree(['/login'], {
      queryParams: { reason: 'connection-error' }
    });
  }
};
