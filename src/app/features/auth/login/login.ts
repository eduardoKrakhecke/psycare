import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'access-denied') {
      this.error.set('Sua conta não está autorizada a acessar esta clínica.');
    } else if (reason === 'connection-error') {
      this.error.set('Não foi possível verificar seu acesso. Tente novamente.');
    }
  }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password || this.loading()) return;
    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.login(this.email.trim(), this.password);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('E-mail ou senha inválidos. Verifique seus dados.');
    } finally {
      this.loading.set(false);
    }
  }
}
