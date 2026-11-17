
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import { MemberService }
  from '../../core/auth/member.service';

import { PatientService }
  from '../../core/services/patient.service';

import { ClinicalService }
  from '../../core/services/clinical.service';

import { FinancialService }
  from '../../core/services/financial.service';

import { PaymentReceiptPdfService }
  from '../../core/services/payment-receipt-pdf.service';

import { ProfessionalService }
  from '../../core/services/professional.service';

import type { Patient }
  from '../../core/models/patient.model';

import type { Professional }
  from '../../core/models/professional.model';

import type {
  Charge,
  Payment,
  PaymentEdit,
  PaymentMethod
} from '../../core/models/financial.model';

import {
  PAYMENT_METHODS,
  centsToInput,
  isOverdue,
  localToday,
  parseMoneyToCents,
  remainingCents,
  validLocalDate
} from '../../core/models/financial.model';

type PaymentForm = {
  amount: string;
  method: PaymentMethod;
  note: string;
};

@Component({
  selector: 'app-financial',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './financial.html',
  styleUrl: './financial.scss'
})
export class Financial implements OnInit {
  private readonly members = inject(MemberService);
  private readonly patientService = inject(PatientService);
  private readonly clinicalService = inject(ClinicalService);
  private readonly financialService = inject(FinancialService);
  private readonly receiptPdfService =
    inject(PaymentReceiptPdfService);
  private readonly professionalService =
    inject(ProfessionalService);

  private historyVersion = 0;

  readonly patients = signal<Patient[]>([]);
  readonly professionals = signal<Professional[]>([]);
  readonly charges = signal<Charge[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly edits = signal<PaymentEdit[]>([]);

  readonly selectedPatientId = signal('');
  readonly selectedChargeId = signal('');
  readonly search = signal('');

  readonly loading = signal(false);
  readonly loadingHistory = signal(false);
  readonly saving = signal(false);
  readonly downloadingReceiptId = signal<string | null>(null);

  readonly error = signal('');
  readonly success = signal('');

  readonly chargeFormOpen = signal(false);
  readonly paymentFormOpen = signal(false);
  readonly editingPayment = signal<Payment | null>(null);
  readonly receiptSignatureOpen = signal(false);
  readonly receiptSignaturePayment = signal<Payment | null>(null);
  readonly receiptSignatureHasInk = signal(false);

  readonly paymentMethods = PAYMENT_METHODS;
  readonly today = localToday();

  @ViewChild('receiptSignatureCanvas')
  private receiptSignatureCanvas?:
    ElementRef<HTMLCanvasElement>;

  private receiptSignatureContext:
    CanvasRenderingContext2D | null = null;
  private receiptSignatureDrawing = false;

  readonly isAdmin = computed(() =>
    this.members.currentMember()?.role === 'admin'
  );

  readonly selectedPatient = computed(() =>
    this.patients().find(
      item => item.id === this.selectedPatientId()
    ) ?? null
  );

  readonly selectedPatientProfessional = computed(() => {
    const patient = this.selectedPatient();

    return patient
      ? this.professionals().find(
        professional => professional.id === patient.professionalId
      ) ?? null
      : null;
  });

  readonly selectedCharge = computed(() =>
    this.charges().find(
      item => item.id === this.selectedChargeId()
        && item.patientId === this.selectedPatientId()
    ) ?? null
  );

  readonly patientCharges = computed(() =>
    this.charges()
      .filter(item =>
        item.patientId === this.selectedPatientId()
      )
      .sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      )
  );

  readonly filteredPatients = computed(() => {
    const term = this.normalize(this.search());

    return this.patients().filter(patient =>
      this.normalize(patient.fullName).includes(term)
    );
  });

  readonly totalPaid = computed(() =>
    this.charges().reduce(
      (total, charge) => total + charge.paidCents,
      0
    )
  );

  readonly totalDue = computed(() =>
    this.charges().reduce(
      (total, charge) => total + remainingCents(charge),
      0
    )
  );

  readonly overdueTotal = computed(() =>
    this.charges()
      .filter(charge => isOverdue(charge))
      .reduce(
        (total, charge) =>
          total + remainingCents(charge),
        0
      )
  );

  readonly debtorsCount = computed(() => {
    const ids = this.charges()
      .filter(charge => remainingCents(charge) > 0)
      .map(charge => charge.patientId);

    return new Set(ids).size;
  });

  chargeForm = {
    description: 'Sessão de psicologia',
    amount: '',
    dueDate: localToday()
  };

  paymentForm: PaymentForm = {
    amount: '',
    method: 'pix',
    note: ''
  };

  ngOnInit(): void {
    void this.load();
  }

  private normalize(value: string): string {
    return value.toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  money(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  formatDate(date: string): string {
    const [year, month, day] = date.split('-');

    if (!year || !month || !day) return '—';

    return `${day}/${month}/${year}`;
  }

  formatTimestamp(
    timestamp: { toDate(): Date } | undefined
  ): string {
    if (!timestamp) return '—';

    return timestamp.toDate().toLocaleString('pt-BR');
  }

  balance(charge: Charge): number {
    return remainingCents(charge);
  }

  patientDebt(patientId: string): number {
    return this.charges()
      .filter(item => item.patientId === patientId)
      .reduce(
        (total, item) => total + remainingCents(item),
        0
      );
  }

  statusLabel(charge: Charge): string {
    if (charge.status === 'cancelled') return 'Cancelada';

    if (charge.status === 'paid') return 'Paga';

    if (isOverdue(charge)) return 'Vencida';

    return charge.status === 'partial'
      ? 'Parcial'
      : 'Em aberto';
  }

  statusClass(charge: Charge): string {
    if (charge.status === 'cancelled') return 'cancelled';
    if (charge.status === 'paid') return 'paid';
    if (isOverdue(charge)) return 'overdue';

    return charge.status === 'partial'
      ? 'partial'
      : 'open';
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
        throw new Error('Usuário sem acesso financeiro.');
      }

      if (
        member.role === 'psychologist' &&
        !member.professionalId
      ) {
        throw new Error(
          'Seu usuário não possui um psicólogo vinculado.'
        );
      }

      const patients = member.role === 'admin'
        ? await this.patientService.list()
        : await this.clinicalService.listPatients();

      const professionals = member.role === 'admin'
        ? await this.professionalService.list()
        : member.professionalId
          ? await this.professionalService.getById(
            member.professionalId
          ).then(item => item ? [item] : [])
          : [];

      this.patients.set(patients);
      this.professionals.set(professionals);

      const allCharges: Charge[] = [];

      // Consultas em pequenos grupos para reduzir
      // a quantidade de solicitações simultâneas.
      for (let i = 0; i < patients.length; i += 6) {
        const batch = patients.slice(i, i + 6);

        const results = await Promise.all(
          batch.map(patient =>
            this.financialService.listCharges(patient.id)
          )
        );

        allCharges.push(...results.flat());
      }

      this.charges.set(allCharges);

      if (
        this.selectedPatientId() &&
        !patients.some(p => p.id === this.selectedPatientId())
      ) {
        this.selectedPatientId.set('');
        this.selectedChargeId.set('');
      }
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o financeiro.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  selectPatient(patientId: string): void {
    ++this.historyVersion;

    this.selectedPatientId.set(patientId);
    this.selectedChargeId.set('');

    this.payments.set([]);
    this.edits.set([]);

    this.chargeFormOpen.set(false);
    this.paymentFormOpen.set(false);

    this.error.set('');
    this.success.set('');
  }

  async selectCharge(chargeId: string): Promise<void> {
    const version = ++this.historyVersion;

    this.selectedChargeId.set(chargeId);
    this.payments.set([]);
    this.edits.set([]);

    if (!chargeId) return;

    const patientId = this.selectedPatientId();

    this.loadingHistory.set(true);
    this.error.set('');

    try {
      const [payments, edits] = await Promise.all([
        this.financialService.listPayments(
          patientId, chargeId
        ),
        this.financialService.listPaymentEdits(
          patientId, chargeId
        )
      ]);

      if (version !== this.historyVersion) return;

      this.payments.set(payments);
      this.edits.set(edits);
    } catch {
      if (version === this.historyVersion) {
        this.error.set(
          'Não foi possível carregar o histórico de pagamentos.'
        );
      }
    } finally {
      if (version === this.historyVersion) {
        this.loadingHistory.set(false);
      }
    }
  }

  private async refreshPatient(
    patientId: string
  ): Promise<void> {
    const charges =
      await this.financialService.listCharges(patientId);

    this.charges.update(previous => [
      ...previous.filter(
        item => item.patientId !== patientId
      ),
      ...charges
    ]);
  }

  openChargeForm(): void {
    if (!this.selectedPatient()?.active) {
      this.error.set(
        'O paciente precisa estar ativo para receber cobranças.'
      );
      return;
    }

    this.chargeForm = {
      description: 'Sessão de psicologia',
      amount: '',
      dueDate: localToday()
    };

    this.error.set('');
    this.chargeFormOpen.set(true);
  }

  async saveCharge(): Promise<void> {
    if (this.saving()) return;

    const patientId = this.selectedPatientId();
    const amountCents =
      parseMoneyToCents(this.chargeForm.amount);

    if (
      !patientId ||
      amountCents === null ||
      !validLocalDate(this.chargeForm.dueDate)
    ) {
      this.error.set(
        'Informe valor e data de vencimento válidos.'
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      const id = await this.financialService.createCharge(
        patientId,
        {
          description: this.chargeForm.description,
          amountCents,
          dueDate: this.chargeForm.dueDate
        }
      );

      this.chargeFormOpen.set(false);

      await this.refreshPatient(patientId);
      await this.selectCharge(id);

      this.success.set('Cobrança cadastrada.');
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a cobrança.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  openNewPayment(): void {
    const charge = this.selectedCharge();

    if (
      !charge ||
      remainingCents(charge) <= 0 ||
      this.saving()
    ) {
      return;
    }

    this.editingPayment.set(null);

    this.paymentForm = {
      amount: centsToInput(remainingCents(charge)),
      method: 'pix',
      note: ''
    };

    this.error.set('');
    this.paymentFormOpen.set(true);
  }

  openEditPayment(payment: Payment): void {
    if (
      !this.selectedCharge() ||
      this.selectedCharge()?.status === 'cancelled' ||
      this.saving()
    ) {
      return;
    }

    this.editingPayment.set(payment);

    this.paymentForm = {
      amount: centsToInput(payment.amountCents),
      method: payment.method,
      note: payment.note
    };

    this.error.set('');
    this.paymentFormOpen.set(true);
  }

  closePaymentForm(): void {
    if (this.saving()) return;

    this.paymentFormOpen.set(false);
    this.editingPayment.set(null);
  }

  async savePayment(): Promise<void> {
    if (this.saving()) return;

    const patientId = this.selectedPatientId();
    const chargeId = this.selectedChargeId();

    const amountCents =
      parseMoneyToCents(this.paymentForm.amount);

    if (
      !patientId ||
      !chargeId ||
      amountCents === null
    ) {
      this.error.set('Informe um pagamento válido.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    try {
      const input = {
        amountCents,
        method: this.paymentForm.method,
        note: this.paymentForm.note
      };

      const editing = this.editingPayment();

      if (editing) {
        await this.financialService.editPayment(
          patientId,
          chargeId,
          editing.id,
          input
        );
      } else {
        await this.financialService.registerPayment(
          patientId,
          chargeId,
          input
        );
      }

      this.paymentFormOpen.set(false);
      this.editingPayment.set(null);

      await this.refreshPatient(patientId);
      await this.selectCharge(chargeId);

      this.success.set(
        editing
          ? 'Pagamento atualizado e alteração registrada.'
          : 'Pagamento registrado com sucesso.'
      );
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o pagamento.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  downloadReceipt(payment: Payment): void {
    this.openReceiptSignature(payment);
    return;

    const patient = this.selectedPatient()!;
    const charge = this.selectedCharge()!;

    if (!patient || !charge) {
      this.error.set('Selecione uma cobrança válida.');
      return;
    }

    this.downloadingReceiptId.set(payment.id);
    this.error.set('');

    try {
      this.receiptPdfService.exportReceipt(
        patient,
        charge,
        payment
      );
      this.success.set('Recibo de pagamento gerado.');
    } catch {
      this.error.set('Não foi possível gerar o recibo.');
    } finally {
      this.downloadingReceiptId.set(null);
    }
  }

  openReceiptSignature(payment: Payment): void {
    const patient = this.selectedPatient();
    const charge = this.selectedCharge();
    const professional = this.selectedPatientProfessional();

    if (!patient || !charge) {
      this.error.set('Selecione uma cobranÃ§a vÃ¡lida.');
      return;
    }

    if (this.downloadingReceiptId()) return;

    if (!professional) {
      this.error.set(
        'O paciente nao possui um psicologo responsavel ativo cadastrado.'
      );
      return;
    }

    const member = this.members.currentMember();

    if (
      !member?.professionalId ||
      member.professionalId !== professional.id
    ) {
      this.error.set(
        'A assinatura deve ser realizada pelo psicologo responsavel pelo paciente.'
      );
      return;
    }

    this.receiptSignaturePayment.set(payment);
    this.receiptSignatureHasInk.set(false);
    this.receiptSignatureOpen.set(true);
    this.error.set('');

    requestAnimationFrame(() =>
      this.initializeReceiptSignatureCanvas()
    );
  }

  private initializeReceiptSignatureCanvas(): void {
    const canvas = this.receiptSignatureCanvas?.nativeElement;

    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 200;

    canvas.width = width * ratio;
    canvas.height = height * ratio;

    this.receiptSignatureContext = canvas.getContext('2d');

    if (!this.receiptSignatureContext) return;

    this.receiptSignatureContext.scale(ratio, ratio);
    this.receiptSignatureContext.lineCap = 'round';
    this.receiptSignatureContext.lineJoin = 'round';
    this.receiptSignatureContext.lineWidth = 2.4;
    this.receiptSignatureContext.strokeStyle = '#172a46';
  }

  private receiptSignaturePoint(event: PointerEvent): {
    x: number;
    y: number;
  } | null {
    const canvas = this.receiptSignatureCanvas?.nativeElement;

    if (!canvas) return null;

    const bounds = canvas.getBoundingClientRect();

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
  }

  startReceiptSignature(event: PointerEvent): void {
    const point = this.receiptSignaturePoint(event);

    if (!point || !this.receiptSignatureContext) return;

    this.receiptSignatureDrawing = true;
    event.currentTarget instanceof HTMLCanvasElement &&
      event.currentTarget.setPointerCapture(event.pointerId);
    this.receiptSignatureContext.beginPath();
    this.receiptSignatureContext.moveTo(point.x, point.y);
  }

  drawReceiptSignature(event: PointerEvent): void {
    const point = this.receiptSignaturePoint(event);

    if (
      !this.receiptSignatureDrawing ||
      !point ||
      !this.receiptSignatureContext
    ) {
      return;
    }

    this.receiptSignatureContext.lineTo(point.x, point.y);
    this.receiptSignatureContext.stroke();
    this.receiptSignatureHasInk.set(true);
  }

  endReceiptSignature(): void {
    this.receiptSignatureDrawing = false;
  }

  clearReceiptSignature(): void {
    const canvas = this.receiptSignatureCanvas?.nativeElement;

    if (!canvas || !this.receiptSignatureContext) return;

    this.receiptSignatureContext.clearRect(
      0,
      0,
      canvas.clientWidth,
      canvas.clientHeight
    );
    this.receiptSignatureHasInk.set(false);
  }

  closeReceiptSignature(force = false): void {
    if (this.downloadingReceiptId() && !force) return;

    this.receiptSignatureOpen.set(false);
    this.receiptSignaturePayment.set(null);
    this.receiptSignatureHasInk.set(false);
    this.receiptSignatureContext = null;
    this.receiptSignatureDrawing = false;
  }

  async confirmReceiptSignature(): Promise<void> {
    const patient = this.selectedPatient();
    const charge = this.selectedCharge();
    const payment = this.receiptSignaturePayment();
    const professional = this.selectedPatientProfessional();
    const canvas = this.receiptSignatureCanvas?.nativeElement;

    if (
      !patient ||
      !charge ||
      !payment ||
      !professional ||
      !canvas ||
      !this.receiptSignatureHasInk()
    ) {
      this.error.set('Desenhe sua assinatura antes de confirmar.');
      return;
    }

    this.downloadingReceiptId.set(payment.id);
    this.error.set('');

    try {
      this.receiptPdfService.exportReceipt(
        patient,
        charge,
        payment,
        {
          professional: {
            name: professional.fullName,
            crp: professional.crp
          },
          signature: {
            dataUrl: canvas.toDataURL('image/png'),
            signerName: professional.fullName,
            signerCrp: professional.crp
          }
        }
      );
      this.closeReceiptSignature(true);
      this.success.set('Recibo assinado gerado.');
    } catch {
      this.error.set('Nao foi possivel gerar o recibo assinado.');
    } finally {
      this.downloadingReceiptId.set(null);
    }
  }

  downloadUnsignedReceipt(payment: Payment): void {
    const patient = this.selectedPatient();
    const charge = this.selectedCharge();
    const professional = this.selectedPatientProfessional();

    if (!patient || !charge) {
      this.error.set('Selecione uma cobranÃ§a vÃ¡lida.');
      return;
    }

    if (this.downloadingReceiptId()) return;

    if (!professional) {
      this.error.set(
        'O paciente nao possui um psicologo responsavel ativo cadastrado.'
      );
      return;
    }

    this.downloadingReceiptId.set(payment.id);
    this.error.set('');

    try {
      this.receiptPdfService.exportReceipt(
        patient,
        charge,
        payment,
        {
          professional: {
            name: professional.fullName,
            crp: professional.crp
          }
        }
      );
      this.success.set(
        'Recibo sem assinatura gerado para assinatura externa.'
      );
    } catch {
      this.error.set('Nao foi possivel gerar o recibo.');
    } finally {
      this.downloadingReceiptId.set(null);
    }
  }

  async cancelCharge(charge: Charge): Promise<void> {
    if (this.saving()) return;

    if (!confirm(
      `Cancelar a cobrança "${charge.description}"?`
    )) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.financialService.cancelCharge(
        charge.patientId,
        charge.id
      );

      await this.refreshPatient(charge.patientId);
      await this.selectCharge(charge.id);

      this.success.set('Cobrança cancelada.');
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível cancelar.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
