
import {
  Component,
  computed,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import { MemberService }
  from '../../core/auth/member.service';

import { PatientService }
  from '../../core/services/patient.service';

import { ProfessionalService }
  from '../../core/services/professional.service';

import type {
  Patient,
  PatientInput
} from '../../core/models/patient.model';

import type { Professional }
  from '../../core/models/professional.model';

function emptyPatient(): PatientInput {
  return {
    fullName: '',
    birthDate: '',
    cpf: '',
    phone: '',
    email: '',
    contactName: '',
    contactPhone: '',
    professionalId: '',
    active: true
  };
}

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year < 1900 || value > localToday()) {
    return false;
  }

  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function validCpf(cpf: string): boolean {
  if (!cpf) return true;

  if (
    !/^\d{11}$/.test(cpf) ||
    /^(\d)\1{10}$/.test(cpf)
  ) {
    return false;
  }

  for (let size = 9; size <= 10; size++) {
    let sum = 0;

    for (let i = 0; i < size; i++) {
      sum += Number(cpf[i]) * (size + 1 - i);
    }

    let digit = (sum * 10) % 11;

    if (digit === 10) {
      digit = 0;
    }

    if (digit !== Number(cpf[size])) {
      return false;
    }
  }

  return true;
}

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './patients.html',
  styleUrl: './patients.scss'
})
export class Patients implements OnInit {
  private readonly patientService = inject(PatientService);
  private readonly professionalService = inject(ProfessionalService);
  private readonly memberService = inject(MemberService);

  readonly today = localToday();

  readonly patients = signal<Patient[]>([]);
  readonly professionals = signal<Professional[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly error = signal('');
  readonly success = signal('');

  readonly search = signal('');
  readonly editorOpen = signal(false);
  readonly editingPatient = signal<Patient | null>(null);

  readonly canManage = computed(() =>
    ['admin', 'receptionist'].includes(
      this.memberService.currentMember()?.role ?? ''
    )
  );

  readonly filtered = computed(() => {
    const text = this.search()
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const digits = this.search().replace(/\D/g, '');

    return this.patients().filter(patient => {
      const name = patient.fullName
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return (
        !text ||
        name.includes(text) ||
        (!!digits && patient.cpf.includes(digits))
      );
    });
  });

  readonly totalActive = computed(() =>
    this.patients().filter(patient => patient.active).length
  );

  readonly availableProfessionals = computed(() =>
    this.professionals().filter(item => item.active)
  );

  form: PatientInput = emptyPatient();

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    if (!this.canManage()) return;

    this.loading.set(true);
    this.error.set('');

    try {
      const [patients, professionals] = await Promise.all([
        this.patientService.list(),
        this.professionalService.list()
      ]);

      this.patients.set(patients);
      this.professionals.set(professionals);
    } catch {
      this.error.set(
        'Não foi possível carregar os pacientes. ' +
        'Verifique a conexão e as permissões do Firestore.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  professionalName(id: string): string {
    return this.professionals()
        .find(item => item.id === id)?.fullName
      ?? 'Profissional não encontrado';
  }

  formatBirthDate(value: string): string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return '—';
    }

    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  openNew(): void {
    if (!this.canManage()) return;

    if (this.availableProfessionals().length === 0) {
      this.error.set(
        'Cadastre e ative pelo menos um psicólogo ' +
        'antes de cadastrar pacientes.'
      );
      return;
    }

    this.form = emptyPatient();
    this.editingPatient.set(null);
    this.editorOpen.set(true);

    this.error.set('');
    this.success.set('');
  }

  edit(patient: Patient): void {
    if (!this.canManage()) return;

    this.editingPatient.set(patient);

    this.form = {
      fullName: patient.fullName,
      birthDate: patient.birthDate,
      cpf: patient.cpf,
      phone: patient.phone,
      email: patient.email,
      contactName: patient.contactName,
      contactPhone: patient.contactPhone,
      professionalId: patient.professionalId,
      active: patient.active
    };

    this.error.set('');
    this.success.set('');
    this.editorOpen.set(true);
  }

  close(): void {
    if (this.saving()) return;
    this.editorOpen.set(false);
  }

  private normalizedInput(): PatientInput {
    return {
      fullName: this.form.fullName.trim(),
      birthDate: this.form.birthDate,
      cpf: this.form.cpf.replace(/\D/g, ''),
      phone: this.form.phone.trim(),
      email: this.form.email.trim().toLowerCase(),
      contactName: this.form.contactName.trim(),
      contactPhone: this.form.contactPhone.trim(),
      professionalId: this.form.professionalId,
      active: this.form.active
    };
  }

  async submit(): Promise<void> {
    if (!this.canManage() || this.saving()) return;

    this.error.set('');
    this.success.set('');

    const input = this.normalizedInput();

    if (
      input.fullName.length < 3 ||
      input.fullName.length > 120
    ) {
      this.error.set(
        'O nome deve conter entre 3 e 120 caracteres.'
      );
      return;
    }

    if (!validBirthDate(input.birthDate)) {
      this.error.set('Informe uma data de nascimento válida.');
      return;
    }

    if (!validCpf(input.cpf)) {
      this.error.set('O CPF informado é inválido.');
      return;
    }

    if (
      (!input.phone && !input.email) ||
      input.phone.length > 30 ||
      input.email.length > 160 ||
      (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(input.email))
    ) {
      this.error.set(
        'Informe pelo menos um telefone ou e-mail válido.'
      );
      return;
    }

    if (
      input.contactName.length > 120 ||
      input.contactPhone.length > 30 ||
      (input.contactPhone && !input.contactName)
    ) {
      this.error.set(
        'Verifique os dados do contato de referência.'
      );
      return;
    }

    const selectedProfessional = this.professionals()
      .find(item => item.id === input.professionalId);

    const previousProfessionalId =
      this.editingPatient()?.professionalId;

    if (
      !selectedProfessional ||
      (
        !selectedProfessional.active &&
        previousProfessionalId !== selectedProfessional.id
      )
    ) {
      this.error.set(
        'Selecione um psicólogo ativo para o paciente.'
      );
      return;
    }

    this.saving.set(true);

    try {
      const patient = this.editingPatient();

      if (patient) {
        await this.patientService.update(patient.id, input);
      } else {
        await this.patientService.create(input);
      }

      this.editorOpen.set(false);

      await this.reload();

      this.success.set(
        patient
          ? 'Paciente atualizado com sucesso.'
          : 'Paciente cadastrado com sucesso.'
      );
    } catch {
      this.error.set(
        'Não foi possível salvar o paciente. ' +
        'Confira as permissões e tente novamente.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(patient: Patient): Promise<void> {
    if (!this.canManage() || this.saving()) return;

    const action = patient.active ? 'desativar' : 'reativar';

    if (!confirm(
      `Deseja ${action} o cadastro de ${patient.fullName}?`
    )) {
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    try {
      await this.patientService.setActive(
        patient.id,
        !patient.active
      );

      await this.reload();

      this.success.set(
        patient.active
          ? 'Cadastro desativado.'
          : 'Cadastro reativado.'
      );
    } catch {
      this.error.set(
        'Não foi possível alterar a situação do cadastro.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
