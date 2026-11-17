
import {
  Component,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { MemberAdminService } from '../../core/services/member-admin.service';

import type {
  ClinicMember,
  OperationalRole
} from '../../core/models/member.model';

interface AccessDraft {
  role: OperationalRole;
  active: boolean;
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

  readonly auth = inject(AuthService);
  readonly items = signal<ClinicMember[]>([]);
  readonly loading = signal(false);
  readonly savingUid = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');

  drafts: Record<string, AccessDraft> = {};

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const items = await this.service.list();

      this.items.set(items);

      this.drafts = Object.fromEntries(
        items
          .filter(item => item.role !== 'admin')
          .map(item => [
            item.uid,
            {
              role: item.role as OperationalRole,
              active: item.active
            }
          ])
      );
    } catch {
      this.error.set(
        'Não foi possível listar os membros. ' +
        'Confirme seu perfil administrador.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async save(item: ClinicMember): Promise<void> {
    if (
      item.role === 'admin' ||
      item.uid === this.auth.currentUser()?.uid
    ) {
      return;
    }

    const draft = this.drafts[item.uid];

    if (
      !draft ||
      !['psychologist', 'receptionist'].includes(draft.role)
    ) {
      return;
    }

    this.savingUid.set(item.uid);
    this.error.set('');
    this.success.set('');

    try {
      await this.service.updateOperationalAccess(
        item.uid,
        draft.role,
        draft.active
      );

      await this.reload();

      this.success.set(
        `Permissões de ${item.name} atualizadas.`
      );
    } catch {
      this.error.set(
        'Não foi possível salvar as permissões. ' +
        'Confira as regras do Firestore.'
      );
    } finally {
      this.savingUid.set(null);
    }
  }
}
