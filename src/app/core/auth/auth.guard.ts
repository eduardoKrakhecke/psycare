import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '../firebase/firebase';
import { MemberService } from './member.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const members = inject(MemberService);

  await firebaseAuth.authStateReady();

  if (!firebaseAuth.currentUser) {
    return router.createUrlTree(['/login']);
  }

  try {
    const member = await members.refresh();

    if (member) {
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
