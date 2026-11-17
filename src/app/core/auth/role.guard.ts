import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { MemberService } from './member.service';
import type { UserRole } from '../models/member.model';

export const roleGuard: CanActivateFn = async route => {
  const router = inject(Router);
  const members = inject(MemberService);
  const allowed = route.data['roles'] as UserRole[] | undefined;

  try {
    const member = await members.refresh();

    if (!member) {
      return router.createUrlTree(['/login']);
    }

    return !allowed || allowed.includes(member.role)
      ? true
      : router.createUrlTree(['/dashboard']);
  } catch {
    return router.createUrlTree(['/dashboard']);
  }
};
