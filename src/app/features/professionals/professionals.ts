
import {
  Component,
  computed,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import { MemberService } from '../../core/auth/member.service';
import { ProfessionalService } from '../../core/services/professional.service';

import type {
  Professional,
  ProfessionalInput
} from '../../core/models/professional.model';

interface ProfessionalForm {
  fullName: string;
  crp: string;
  email: string;
  phone: string;
  specialtiesText: string;
  active: boolean;
}

function emptyForm(): ProfessionalForm {
  return {
    fullName: '',
    crp: '',
    email: '',
    phone: '',
    specialtiesText: '',
    active: true
  };
}

@Component({
  selector: 'app-professionals',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './professionals.html',
  styleUrl: './professionals.scss'
})
export class Professionals implements OnInit {
  private readonly service = inject(ProfessionalService);
  private readonly members = inject(MemberService);

  readonly canEdit = computed(
    () => this.members.currentMember()?.role === 'admin'
  );

  readonly professionals = signal<Professional[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly search = signal('');

  readonly filtered = computed(() => {
    const term = this.search()
      .trim()
      .toLocaleLowerCase('pt-BR');

    return this.professionals().filter(item =>
      !term ||
      [
        item.fullName,
        item.crp,
        item.email,
        ...item.specialties
      ].some(value =>
        value.toLocaleLowerCase('pt-BR').includes(term)
      )
    );
  });

  form: ProfessionalForm = emptyForm();

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      this.professionals.set(
        await this.service.list()
      );
    } catch {
      this.error.set(
        'Não foi possível consultar os profissionais. ' +
        'Verifique suas permissões e conexão.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  openNew(): void {
    if (!this.canEdit()) return;

    this.editingId.set(null);
    this.form = emptyForm();
    this.error.set('');
    this.success.set('');
    this.editorOpen.set(true);
  }

  edit(item: Professional): void {
    if (!this.canEdit()) return;

    this.editingId.set(item.id);

    this.form = {
      fullName: item.fullName,
      crp: item.crp,
      email: item.email,
      phone: item.phone,
      specialtiesText: item.specialties.join(', '),
      active: item.active
    };

    this.error.set('');
    this.success.set('');
    this.editorOpen.set(true);
  }

  close(): void {
    this.editorOpen.set(false);
  }

  async submit(): Promise<void> {
    if (!this.canEdit() || this.saving()) return;

    this.error.set('');
    this.success.set('');

    const specialties = [
      ...new Set(
        this.form.specialtiesText
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      )
    ];

    const input: ProfessionalInput = {
      fullName: this.form.fullName.trim(),
      crp: this.form.crp.trim(),
      email: this.form.email.trim().toLowerCase(),
      phone: this.form.phone.trim(),
      specialties,
      active: this.form.active
    };

    if (
      input.fullName.length < 3 ||
      input.fullName.length > 120 ||
      input.crp.length < 3 ||
      input.crp.length > 30 ||
      input.email.length > 160 ||
      input.phone.length > 30 ||
      specialties.length > 12 ||
      specialties.some(value => value.length > 80)
    ) {
      this.error.set(
        'Verifique nome (3–120), CRP (3–30), ' +
        'e-mail, telefone e até 12 especialidades ' +
        'de 80 caracteres.'
      );
      return;
    }

    this.saving.set(true);

    try {
      const id = this.editingId();

      if (id) {
        await this.service.update(id, input);
      } else {
        await this.service.create(input);
      }

      this.close();
      await this.reload();

      this.success.set(
        id
          ? 'Profissional atualizado.'
          : 'Profissional cadastrado.'
      );
    } catch {
      this.error.set(
        'Não foi possível salvar. Confira suas ' +
        'permissões e as regras do Firestore.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(item: Professional): Promise<void> {
    if (!this.canEdit() || this.saving()) return;

    const action = item.active ? 'desativar' : 'reativar';

    if (!confirm(`Deseja ${action} ${item.fullName}?`)) {
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    try {
      await this.service.setActive(item.id, !item.active);
      await this.reload();

      this.success.set(
        item.active
          ? 'Profissional desativado.'
          : 'Profissional reativado.'
      );
    } catch {
      this.error.set(
        'Não foi possível modificar a situação do profissional.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
