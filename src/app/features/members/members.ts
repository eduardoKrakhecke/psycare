
import {
  Component,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/auth/auth.service';

import { MemberAdminService }
  from '../../core/services/member-admin.service';

import { ProfessionalService }
  from '../../core/services/professional.service';

import type {
  ClinicMember,
  OperationalRole
} from '../../core/models/member.model';

import type { Professional }
  from '../../core/models/professional.model';

interface AccessDraft {
  role: OperationalRole;
  active: boolean;
  professionalId: string;
}

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './members.html',
  styleUrl: './members.scss'
})
export class Members implements OnInit {
  private readonly service = inject(MemberAdminService);
  private readonly professionalsService = inject(ProfessionalService);

  readonly auth = inject(AuthService);

  readonly items = signal<ClinicMember[]>([]);
  readonly professionals = signal<Professional[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly newMemberOpen = signal(false);

  drafts: Record<string, AccessDraft> = {};

  newMember = {
    uid: '',
    name: '',
    role: 'receptionist' as OperationalRole,
    professionalId: ''
  };

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const [members, professionals] = await Promise.all([
        this.service.list(),
        this.professionalsService.list()
      ]);

      this.items.set(members);
      this.professionals.set(professionals);

      this.drafts = Object.fromEntries(
        members
          .filter(item => item.role !== 'admin')
          .map(item => [
            item.uid,
            {
              role: item.role as OperationalRole,
              active: item.active,
              professionalId: item.professionalId ?? ''
            }
          ])
      );
    } catch {
      this.error.set(
        'Não foi possível carregar usuários e profissionais.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private validProfessional(
    role: OperationalRole,
    professionalId: string
  ): boolean {
    if (role === 'receptionist') return true;

    return this.professionals().some(item =>
      item.id === professionalId && item.active
    );
  }

  async save(item: ClinicMember): Promise<void> {
    if (
      this.saving() ||
      item.role === 'admin' ||
      item.uid === this.auth.currentUser()?.uid
    ) {
      return;
    }

    const draft = this.drafts[item.uid];

    if (
      !draft ||
      !this.validProfessional(
        draft.role,
        draft.professionalId
      )
    ) {
      this.error.set(
        'Selecione um psicólogo ativo para esse usuário.'
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    try {
      await this.service.updateOperationalAccess(
        item.uid,
        draft.role,
        draft.active,
        draft.professionalId
      );

      await this.reload();
      this.success.set('Permissões atualizadas com sucesso.');
    } catch {
      this.error.set(
        'Não foi possível atualizar as permissões.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async create(): Promise<void> {
    if (this.saving()) return;

    const uid = this.newMember.uid.trim();
    const name = this.newMember.name.trim();
    const role = this.newMember.role;
    const professionalId = this.newMember.professionalId;

    if (
      !/^[A-Za-z0-9_-]{6,128}$/.test(uid) ||
      name.length < 2 ||
      name.length > 120 ||
      !this.validProfessional(role, professionalId)
    ) {
      this.error.set(
        'Informe um UID válido, nome e profissional ativo ' +
        'quando o perfil for psicólogo.'
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    try {
      await this.service.createMembership(
        uid,
        name,
        role,
        professionalId
      );

      this.newMemberOpen.set(false);
      this.newMember = {
        uid: '',
        name: '',
        role: 'receptionist',
        professionalId: ''
      };

      await this.reload();

      this.success.set('Usuário vinculado à clínica.');
    } catch {
      this.error.set(
        'Não foi possível vincular o usuário. ' +
        'Verifique se o UID está correto e ainda não foi utilizado.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
