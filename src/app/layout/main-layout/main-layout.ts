
import {
  Component,
  computed,
  inject,
  signal
} from '@angular/core';

import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { AuthService }
  from '../../core/auth/auth.service';

import { MemberService }
  from '../../core/auth/member.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss'
})
export class MainLayout {
  readonly authService = inject(AuthService);
  readonly memberService = inject(MemberService);

  private readonly router = inject(Router);

  readonly dark = signal(false);

  readonly isAdmin = computed(() =>
    this.memberService.currentMember()?.role === 'admin'
  );

  readonly canAccessClinical = computed(() =>
    ['admin', 'psychologist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );


  readonly canAccessFinancial = computed(() =>
    ['admin', 'psychologist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );


  readonly canManageAppointments = computed(() =>
    ['admin', 'receptionist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );

  readonly canManagePatients = computed(() =>
    ['admin', 'receptionist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );

  readonly canViewProfessionals = computed(() =>
    ['admin', 'receptionist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );

  toggleTheme(): void {
    this.dark.update(value => !value);

    document.documentElement.classList.toggle(
      'app-dark',
      this.dark()
    );
  }

  async logout(): Promise<void> {
    await this.authService.logout();

    this.memberService.clear();

    await this.router.navigateByUrl('/login');
  }
}
