
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

import { ProfessionalService }
  from '../../core/services/professional.service';

import { PsychologicalDocumentService }
  from '../../core/services/psychological-document.service';

import { DocumentPdfService }
  from '../../core/services/document-pdf.service';

import type { Patient }
  from '../../core/models/patient.model';

import type { Professional }
  from '../../core/models/professional.model';

import {
  DOCUMENT_TYPES,
  documentTypeLabel,
  localDocumentDate,
  type DocumentInput,
  type PsychologicalDocument,
  type PsychologicalDocumentType
} from '../../core/models/psychological-document.model';

function emptyDocument(): DocumentInput {
  return {
    type: 'declaration',
    title: 'Declaração',
    content: '',
    documentDate: localDocumentDate()
  };
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './documents.html',
  styleUrl: './documents.scss'
})
export class Documents implements OnInit {
  private readonly members = inject(MemberService);
  private readonly clinicalService = inject(ClinicalService);
  private readonly professionalService = inject(ProfessionalService);
  private readonly documentService =
    inject(PsychologicalDocumentService);
  private readonly pdfService = inject(DocumentPdfService);

  private requestVersion = 0;

  readonly documentTypes = DOCUMENT_TYPES;
  readonly today = localDocumentDate();

  readonly patients = signal<Patient[]>([]);
  readonly professionals = signal<Professional[]>([]);
  readonly documents = signal<PsychologicalDocument[]>([]);

  readonly selectedPatientId = signal('');
  readonly editingId = signal<string | null>(null);

  readonly editorOpen = signal(false);
  readonly loading = signal(false);
  readonly loadingDocuments = signal(false);
  readonly saving = signal(false);
  readonly downloadingId = signal<string | null>(null);

  readonly error = signal('');
  readonly success = signal('');

  readonly isAdmin = computed(() =>
    this.members.currentMember()?.role === 'admin'
  );

  readonly selectedPatient = computed(() =>
    this.patients().find(
      patient => patient.id === this.selectedPatientId()
    ) ?? null
  );

  readonly canWrite = computed(() => {
    const member = this.members.currentMember();
    const patient = this.selectedPatient();

    if (!member?.active || !patient?.active) {
      return false;
    }

    if (member.role === 'admin') {
      return true;
    }

    return (
      member.role === 'psychologist' &&
      !!member.professionalId &&
      member.professionalId === patient.professionalId
    );
  });

  form: DocumentInput = emptyDocument();
  formProfessionalId = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const member = await this.members.refresh();

      if (
        !member ||
        !['admin', 'psychologist'].includes(member.role)
      ) {
        throw new Error('Usuário sem acesso ao módulo.');
      }

      const patients = await this.clinicalService.listPatients();

      let professionals: Professional[] = [];

      if (member.role === 'admin') {
        professionals = await this.professionalService.list();
      } else {
        if (!member.professionalId) {
          throw new Error(
            'Psicólogo sem cadastro profissional vinculado.'
          );
        }

        const professional =
          await this.professionalService.getById(
            member.professionalId
          );

        if (!professional) {
          throw new Error(
            'Cadastro do psicólogo não encontrado.'
          );
        }

        professionals = [professional];
      }

      this.patients.set(patients);
      this.professionals.set(professionals);

      if (this.selectedPatientId()) {
        await this.loadDocuments();
      }
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar o módulo de documentos.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async selectPatient(patientId: string): Promise<void> {
    ++this.requestVersion;

    this.selectedPatientId.set(patientId);
    this.documents.set([]);

    this.closeEditor();
    this.error.set('');
    this.success.set('');

    if (patientId) {
      await this.loadDocuments();
    }
  }

  async loadDocuments(): Promise<void> {
    const patientId = this.selectedPatientId();

    if (!patientId) return;

    const version = ++this.requestVersion;

    this.loadingDocuments.set(true);
    this.error.set('');

    try {
      const documents = await this.documentService.list(
        patientId
      );

      if (version !== this.requestVersion) return;

      this.documents.set(documents);
    } catch {
      if (version === this.requestVersion) {
        this.error.set(
          'Não foi possível carregar os documentos salvos.'
        );
      }
    } finally {
      if (version === this.requestVersion) {
        this.loadingDocuments.set(false);
      }
    }
  }

  openNew(): void {
    if (!this.canWrite()) {
      this.error.set(
        'Selecione um paciente ativo para criar o documento.'
      );
      return;
    }

    this.form = emptyDocument();
    this.editingId.set(null);

    const patient = this.selectedPatient()!;

    const preferred = this.professionals().find(
      professional =>
        professional.id === patient.professionalId &&
        professional.active
    );

    this.formProfessionalId =
      preferred?.id ??
      this.professionals().find(
        professional => professional.active
      )?.id ??
      '';

    this.editorOpen.set(true);
    this.error.set('');
    this.success.set('');
  }

  openEdit(document: PsychologicalDocument): void {
    if (!this.canWrite()) return;

    this.form = {
      type: document.type,
      title: document.title,
      content: document.content,
      documentDate: document.documentDate
    };

    this.formProfessionalId = document.professionalId;

    this.editingId.set(document.id);
    this.editorOpen.set(true);

    this.error.set('');
    this.success.set('');
  }

  closeEditor(): void {
    if (this.saving()) return;

    this.editorOpen.set(false);
    this.editingId.set(null);
  }

  changeType(type: PsychologicalDocumentType): void {
    if (this.editingId()) return;

    const previousTitle = documentTypeLabel(
      this.form.type
    );

    const nextTitle = documentTypeLabel(type);

    if (
      !this.form.title.trim() ||
      this.form.title === previousTitle
    ) {
      this.form.title = nextTitle;
    }

    this.form.type = type;
  }

  typeLabel(type: PsychologicalDocumentType): string {
    return documentTypeLabel(type);
  }

  formatDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return '—';
    }

    const [year, month, day] = value.split('-');

    return `${day}/${month}/${year}`;
  }

  professionalName(id: string): string {
    return this.professionals().find(
      item => item.id === id
    )?.fullName ?? 'Profissional cadastrado';
  }

  private async exportSavedDocument(
    patientId: string,
    documentId: string
  ): Promise<void> {
    const stored = await this.documentService.getById(
      patientId,
      documentId
    );

    this.pdfService.exportPdf(stored);
  }

  async download(document: PsychologicalDocument): Promise<void> {
    if (this.downloadingId()) return;

    this.downloadingId.set(document.id);
    this.error.set('');

    try {
      await this.exportSavedDocument(
        this.selectedPatientId(),
        document.id
      );
    } catch {
      this.error.set(
        'Não foi possível recuperar ou gerar o PDF.'
      );
    } finally {
      this.downloadingId.set(null);
    }
  }

  async save(generatePdf = false): Promise<void> {
    if (this.saving() || !this.canWrite()) return;

    const patient = this.selectedPatient();
    const professional = this.professionals().find(
      item => item.id === this.formProfessionalId
    );

    if (!patient || !professional) {
      this.error.set(
        'Selecione um paciente e um profissional válidos.'
      );
      return;
    }

    const input: DocumentInput = {
      type: this.form.type,
      title: this.form.title.trim(),
      content: this.form.content.trim(),
      documentDate: this.form.documentDate
    };

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    let savedId: string | null = null;

    try {
      const editingId = this.editingId();

      if (editingId) {
        await this.documentService.update(
          patient.id,
          editingId,
          input
        );

        savedId = editingId;
      } else {
        savedId = await this.documentService.create(
          patient,
          professional,
          input
        );
      }

      this.editorOpen.set(false);
      this.editingId.set(null);

      await this.loadDocuments();

      if (generatePdf) {
        await this.exportSavedDocument(
          patient.id,
          savedId
        );
      }

      this.success.set(
        generatePdf
          ? 'Documento salvo e PDF gerado.'
          : 'Documento salvo no Firestore.'
      );
    } catch (error) {
      this.error.set(
        savedId
          ? 'Documento salvo, mas houve um problema ' +
          'ao atualizar a listagem ou gerar o PDF.'
          : error instanceof Error
            ? error.message
            : 'Não foi possível salvar o documento.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
