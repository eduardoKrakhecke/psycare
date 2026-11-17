
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

import { ClinicalService }
  from '../../core/services/clinical.service';

import { CidService }
  from '../../core/services/cid.service';

import type { Patient }
  from '../../core/models/patient.model';

import type {
  ClinicalRecord,
  ClinicalRecordInput
} from '../../core/models/clinical-record.model';

import type {
  Assessment,
  AssessmentInput
} from '../../core/models/assessment.model';

import {
  type CidOption,
  type Diagnosis,
  type DiagnosisInput
} from '../../core/models/diagnosis.model';

type ClinicalTab =
  | 'records'
  | 'assessments'
  | 'diagnoses';

function today(): string {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);

  return year >= 1900
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
    && value <= today();
}

function emptyRecord(): ClinicalRecordInput {
  return {
    sessionDate: today(),
    summary: '',
    objectives: ''
  };
}

function emptyAssessment(): AssessmentInput {
  return {
    assessmentDate: today(),
    type: 'initial',
    objective: '',
    method: '',
    observations: '',
    conclusion: ''
  };
}

function emptyDiagnosis(): DiagnosisInput {
  return {
    code: '',
    description: '',
    classification: 'CID-10',
    assessment: 'hypothesis',
    assessmentDate: today()
  };
}

@Component({
  selector: 'app-clinical',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './clinical.html',
  styleUrl: './clinical.scss'
})
export class Clinical implements OnInit {
  private readonly service = inject(ClinicalService);
  private readonly cidService = inject(CidService);

  readonly memberService = inject(MemberService);
  readonly cidOptions = signal<CidOption[]>([]);
  readonly cidSuggestions = signal<CidOption[]>([]);
  readonly cidSearch = signal('');
  readonly cidCatalogLoading = signal(false);
  readonly currentDate = today();

  private loadVersion = 0;

  readonly patients = signal<Patient[]>([]);
  readonly records = signal<ClinicalRecord[]>([]);
  readonly assessments = signal<Assessment[]>([]);
  readonly diagnoses = signal<Diagnosis[]>([]);

  readonly selectedPatientId = signal('');
  readonly search = signal('');

  readonly tab = signal<ClinicalTab>('records');
  readonly formMode = signal<ClinicalTab | null>(null);

  readonly loading = signal(false);
  readonly loadingDetails = signal(false);
  readonly saving = signal(false);

  readonly error = signal('');
  readonly success = signal('');

  readonly isAdmin = computed(() =>
    this.memberService.currentMember()?.role === 'admin'
  );

  readonly selectedPatient = computed(() =>
    this.patients().find(
      patient => patient.id === this.selectedPatientId()
    ) ?? null
  );

  readonly filteredPatients = computed(() => {
    const term = this.normalize(this.search());

    return this.patients().filter(patient =>
      !term ||
      this.normalize(patient.fullName).includes(term)
    );
  });

  readonly canWrite = computed(() => {
    const member = this.memberService.currentMember();
    const patient = this.selectedPatient();

    if (!member?.active || !patient?.active) {
      return false;
    }

    if (member.role === 'admin') {
      return true;
    }

    return member.role === 'psychologist'
      && !!member.professionalId
      && patient.professionalId === member.professionalId;
  });

  recordForm: ClinicalRecordInput = emptyRecord();
  assessmentForm: AssessmentInput = emptyAssessment();
  diagnosisForm: DiagnosisInput = emptyDiagnosis();

  ngOnInit(): void {
    void this.loadPatients();
    void this.loadCidCatalog();
  }

  async loadCidCatalog(): Promise<void> {
    this.cidCatalogLoading.set(true);

    try {
      const options = await this.cidService.loadCatalog();
      this.cidOptions.set([...options]);
    } catch {
      this.error.set(
        'Não foi possível carregar o catálogo completo da CID-10.'
      );
    } finally {
      this.cidCatalogLoading.set(false);
    }
  }

  private normalize(value: string): string {
    return value
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  async loadPatients(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const member = await this.memberService.refresh();

      if (
        !member ||
        !['admin', 'psychologist'].includes(member.role)
      ) {
        throw new Error('Usuário sem acesso clínico.');
      }

      if (
        member.role === 'psychologist' &&
        !member.professionalId
      ) {
        throw new Error(
          'Este psicólogo não possui professionalId vinculado.'
        );
      }

      this.patients.set(await this.service.listPatients());
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os pacientes.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async selectPatient(patientId: string): Promise<void> {
    if (this.saving()) return;

    const version = ++this.loadVersion;

    this.selectedPatientId.set(patientId);
    this.formMode.set(null);
    this.tab.set('records');

    this.records.set([]);
    this.assessments.set([]);
    this.diagnoses.set([]);

    this.error.set('');
    this.success.set('');

    if (!patientId) return;

    this.loadingDetails.set(true);

    try {
      const [records, assessments, diagnoses] =
        await Promise.all([
          this.service.listRecords(patientId),
          this.service.listAssessments(patientId),
          this.service.listDiagnoses(patientId)
        ]);

      if (version !== this.loadVersion) return;

      this.records.set(records);
      this.assessments.set(assessments);
      this.diagnoses.set(diagnoses);
    } catch {
      if (version === this.loadVersion) {
        this.error.set(
          'Não foi possível carregar as informações clínicas.'
        );
      }
    } finally {
      if (version === this.loadVersion) {
        this.loadingDetails.set(false);
      }
    }
  }

  async reloadDetails(patientId: string): Promise<void> {
    const version = ++this.loadVersion;
    this.loadingDetails.set(true);

    try {
      const [records, assessments, diagnoses] =
        await Promise.all([
          this.service.listRecords(patientId),
          this.service.listAssessments(patientId),
          this.service.listDiagnoses(patientId)
        ]);

      if (version !== this.loadVersion) return;

      this.records.set(records);
      this.assessments.set(assessments);
      this.diagnoses.set(diagnoses);
    } finally {
      if (version === this.loadVersion) {
        this.loadingDetails.set(false);
      }
    }
  }

  openForm(mode: ClinicalTab): void {
    if (!this.canWrite() || this.saving()) return;

    this.recordForm = emptyRecord();
    this.assessmentForm = emptyAssessment();
    this.diagnosisForm = emptyDiagnosis();
    this.cidSearch.set('');
    this.cidSuggestions.set([]);

    this.formMode.set(mode);
    this.tab.set(mode);
    this.error.set('');
  }

  closeForm(): void {
    if (!this.saving()) {
      this.formMode.set(null);
    }
  }

  searchCid(value: string): void {
    this.cidSearch.set(value);
    this.diagnosisForm.code = '';
    this.diagnosisForm.description = '';

    const term = this.normalize(value);

    if (!term) {
      this.cidSuggestions.set([]);
      return;
    }

    this.cidSuggestions.set(
      this.cidOptions()
        .filter(option =>
          this.normalize(option.code).includes(term)
          || this.normalize(option.description).includes(term)
        )
        .slice(0, 30)
    );
  }

  selectCid(option: CidOption): void {
    this.diagnosisForm.code = option.code;
    this.diagnosisForm.description = option.description;
    this.cidSearch.set(`${option.code} — ${option.description}`);
    this.cidSuggestions.set([]);
  }

  async saveRecord(): Promise<void> {
    if (!this.canWrite() || this.saving()) return;

    const input: ClinicalRecordInput = {
      sessionDate: this.recordForm.sessionDate,
      summary: this.recordForm.summary.trim(),
      objectives: this.recordForm.objectives.trim()
    };

    if (
      !validDate(input.sessionDate) ||
      input.summary.length < 10 ||
      input.summary.length > 4000 ||
      input.objectives.length > 1000
    ) {
      this.error.set(
        'Verifique a data, a evolução (10–4000 caracteres) ' +
        'e os objetivos (até 1000 caracteres).'
      );
      return;
    }

    await this.persist('records', () =>
      this.service.createRecord(
        this.selectedPatientId(),
        input
      )
    );
  }

  async saveAssessment(): Promise<void> {
    if (!this.canWrite() || this.saving()) return;

    const input: AssessmentInput = {
      assessmentDate: this.assessmentForm.assessmentDate,
      type: this.assessmentForm.type,
      objective: this.assessmentForm.objective.trim(),
      method: this.assessmentForm.method.trim(),
      observations: this.assessmentForm.observations.trim(),
      conclusion: this.assessmentForm.conclusion.trim()
    };

    if (
      !validDate(input.assessmentDate) ||
      !['initial', 'follow_up', 'other'].includes(input.type) ||
      input.objective.length < 5 ||
      input.objective.length > 1000 ||
      input.method.length > 1000 ||
      input.observations.length > 4000 ||
      input.conclusion.length > 2000
    ) {
      this.error.set(
        'Verifique a data, o objetivo (5–1000 caracteres), ' +
        'método, observações e conclusão.'
      );
      return;
    }

    await this.persist('assessments', () =>
      this.service.createAssessment(
        this.selectedPatientId(),
        input
      )
    );
  }

  async saveDiagnosis(): Promise<void> {
    if (!this.canWrite() || this.saving()) return;

    const option = this.cidOptions().find(
      item => item.code === this.diagnosisForm.code
    );

    if (
      !option ||
      !validDate(this.diagnosisForm.assessmentDate) ||
      !['hypothesis', 'confirmed'].includes(
        this.diagnosisForm.assessment
      )
    ) {
      this.error.set(
        'Selecione um CID e uma data de avaliação válidos.'
      );
      return;
    }

    const input: DiagnosisInput = {
      code: option.code,
      description: option.description,
      classification: 'CID-10',
      assessment: this.diagnosisForm.assessment,
      assessmentDate: this.diagnosisForm.assessmentDate
    };

    await this.persist('diagnoses', () =>
      this.service.createDiagnosis(
        this.selectedPatientId(),
        input
      )
    );
  }

  private async persist(
    mode: ClinicalTab,
    saveOperation: () => Promise<string>
  ): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    const patientId = this.selectedPatientId();

    try {
      await saveOperation();

      this.formMode.set(null);

      await this.reloadDetails(patientId);

      this.tab.set(mode);
      this.success.set('Registro salvo com sucesso.');
    } catch {
      this.error.set(
        'Não foi possível salvar o registro. ' +
        'Verifique os dados e suas permissões.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  authorLabel(uid: string): string {
    const currentUid = this.memberService.currentMember()?.uid;

    return uid === currentUid
      ? 'Você'
      : `Usuário ${uid.slice(0, 8)}…`;
  }

  formatDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return '—';
    }

    const [year, month, day] = value.split('-');

    return `${day}/${month}/${year}`;
  }

  assessmentTypeLabel(value: string): string {
    const labels: Record<string, string> = {
      initial: 'Avaliação inicial',
      follow_up: 'Reavaliação',
      other: 'Outra avaliação'
    };

    return labels[value] ?? value;
  }

  diagnosisLabel(value: string): string {
    return value === 'confirmed'
      ? 'Diagnóstico registrado'
      : 'Hipótese diagnóstica';
  }
}
