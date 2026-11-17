
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
  CalendarOptions,
  FullCalendarComponent,
  FullCalendarModule
} from '@fullcalendar/angular';

import dayGridPlugin from '@fullcalendar/angular/daygrid';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import interactionPlugin from '@fullcalendar/angular/interaction';
import classicThemePlugin from '@fullcalendar/angular/themes/classic';
import ptBrLocale from 'fullcalendar/locales/pt-br';

import {
  AppointmentService
} from '../../core/services/appointment.service';

import {
  PatientService
} from '../../core/services/patient.service';

import {
  ProfessionalService
} from '../../core/services/professional.service';

import type {
  Appointment,
  AppointmentStatus
} from '../../core/models/appointment.model';

import {
  APPOINTMENT_STATUSES,
  appointmentEndTime,
  validAppointmentTime
} from '../../core/models/appointment.model';

import type { Patient } from '../../core/models/patient.model';
import type { Professional } from '../../core/models/professional.model';

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [FormsModule, FullCalendarModule],
  templateUrl: './appointments.html',
  styleUrl: './appointments.scss'
})
export class Appointments implements OnInit {
  @ViewChild(FullCalendarComponent)
  calendar?: FullCalendarComponent;

  private readonly appointmentService = inject(AppointmentService);
  private readonly patientService = inject(PatientService);
  private readonly professionalService = inject(ProfessionalService);

  private requestVersion = 0;

  readonly professionals = signal<Professional[]>([]);
  readonly patients = signal<Patient[]>([]);
  readonly appointments = signal<Appointment[]>([]);

  readonly selectedProfessionalId = signal('');
  readonly rangeStart = signal('');
  readonly rangeEnd = signal('');

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  readonly editorMode = signal<'create' | 'reschedule' | null>(null);
  readonly viewing = signal<Appointment | null>(null);

  readonly statuses = APPOINTMENT_STATUSES;

  readonly timeOptions = Array.from(
    { length: 10 },
    (_, i) => `${String(i + 8).padStart(2, '0')}:00`
  );

  readonly activeProfessionals = computed(() =>
    this.professionals().filter(item => item.active)
  );

  readonly availablePatients = computed(() =>
    this.patients().filter(item =>
      item.active &&
      item.professionalId === this.selectedProfessionalId()
    )
  );

  readonly selectedProfessional = computed(() =>
    this.professionals().find(
      item => item.id === this.selectedProfessionalId()
    )
  );

  readonly visibleAppointments = computed(() =>
    this.appointments().filter(item =>
      item.professionalId === this.selectedProfessionalId() &&
      item.status !== 'cancelled'
    )
  );

  readonly totalScheduled = computed(() =>
    this.visibleAppointments().filter(
      item => item.status === 'scheduled'
    ).length
  );

  readonly totalConfirmed = computed(() =>
    this.visibleAppointments().filter(
      item => item.status === 'confirmed'
    ).length
  );

  draftDate = '';
  draftTime = '';
  draftPatientId = '';

  readonly calendarOptions = signal<CalendarOptions>({
    plugins: [
      classicThemePlugin,
      dayGridPlugin,
      timeGridPlugin,
      interactionPlugin
    ],
    locale: ptBrLocale,
    initialView: 'timeGridWeek',
    firstDay: 1,
    weekends: false,
    nowIndicator: true,
    allDaySlot: false,
    editable: false,
    selectable: false,
    height: 'auto',
    slotMinTime: '08:00:00',
    slotMaxTime: '18:00:00',
    slotDuration: '01:00:00',
    snapDuration: '01:00:00',
    displayEventTime: true,
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    },
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    buttons: {
      today: {
        text: 'Hoje',
        display: 'text'
      },
      dayGridMonth: {
        text: 'Mês',
        display: 'text'
      },
      timeGridWeek: {
        text: 'Semana',
        display: 'text'
      },
      timeGridDay: {
        text: 'Dia',
        display: 'text'
      }
    },
    events: [],
    datesSet: info => {
      this.rangeStart.set(localDate(info.start));
      this.rangeEnd.set(localDate(info.end));
      void this.reloadAppointments();
    },
    dateClick: info => {
      if (info.view.type === 'dayGridMonth') {
        this.calendar?.getApi().changeView(
          'timeGridDay',
          info.date
        );
        return;
      }

      const date = localDate(info.date);
      const time =
        `${String(info.date.getHours()).padStart(2, '0')}:00`;

      this.openNew(date, time);
    },
    eventClick: info => {
      this.openDetails(info.event.id);
    }
  });

  ngOnInit(): void {
    void this.loadResources();
  }

  async loadResources(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const [professionals, patients] = await Promise.all([
        this.professionalService.list(),
        this.patientService.list()
      ]);

      this.professionals.set(professionals);
      this.patients.set(patients);

      const first = professionals.find(item => item.active);

      if (first && !this.selectedProfessionalId()) {
        this.selectedProfessionalId.set(first.id);
      }

      await this.reloadAppointments();
    } catch {
      this.error.set(
        'Não foi possível carregar pacientes ou profissionais.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  changeProfessional(id: string): void {
    this.selectedProfessionalId.set(id);
    this.viewing.set(null);
    this.editorMode.set(null);
    this.updateCalendarEvents();
  }

  async reloadAppointments(): Promise<void> {
    if (!this.rangeStart() || !this.rangeEnd()) return;

    const version = ++this.requestVersion;

    this.loading.set(true);

    try {
      const items = await this.appointmentService.list(
        this.rangeStart(),
        this.rangeEnd()
      );

      if (version !== this.requestVersion) return;

      this.appointments.set(items);
      this.updateCalendarEvents();
    } catch {
      if (version === this.requestVersion) {
        this.error.set(
          'Não foi possível consultar os agendamentos.'
        );
      }
    } finally {
      if (version === this.requestVersion) {
        this.loading.set(false);
      }
    }
  }

  private updateCalendarEvents(): void {
    const events = this.visibleAppointments().map(item => {
      const colors: Record<AppointmentStatus, string> = {
        scheduled: '#d99a25',
        confirmed: '#218476',
        completed: '#3478b8',
        no_show: '#9b557b',
        cancelled: '#777777'
      };

      return {
        id: item.id,
        title: this.patientName(item.patientId),
        start: `${item.date}T${item.startTime}:00`,
        end: `${item.date}T${appointmentEndTime(item.startTime)}:00`,
        backgroundColor: colors[item.status],
        borderColor: colors[item.status],
        textColor: '#ffffff'
      };
    });

    this.calendarOptions.update(options => ({
      ...options,
      events
    }));
  }

  patientName(patientId: string): string {
    return this.patients().find(
      item => item.id === patientId
    )?.fullName ?? 'Paciente não encontrado';
  }

  formatDate(value: string): string {
    return displayDate(value);
  }

  openNew(date: string, time: string): void {
    if (!this.selectedProfessionalId()) {
      this.error.set('Selecione um psicólogo.');
      return;
    }

    if (!validAppointmentTime(date, time)) {
      this.error.set('Selecione um horário válido.');
      return;
    }

    if (
      new Date(`${date}T${time}:00`).getTime() <= Date.now()
    ) {
      this.error.set(
        'Não é possível agendar uma consulta no passado.'
      );
      return;
    }

    if (this.availablePatients().length === 0) {
      this.error.set(
        'Não existem pacientes ativos vinculados a este psicólogo.'
      );
      return;
    }

    this.draftDate = date;
    this.draftTime = time;
    this.draftPatientId = '';

    this.viewing.set(null);
    this.editorMode.set('create');
    this.error.set('');
    this.success.set('');
  }

  openDetails(id: string): void {
    const appointment = this.appointments()
      .find(item => item.id === id);

    if (!appointment) return;

    this.viewing.set(appointment);
    this.editorMode.set(null);
    this.error.set('');
  }

  startReschedule(): void {
    const appointment = this.viewing();

    if (!appointment || !this.canModify(appointment)) {
      return;
    }

    this.draftDate = appointment.date;
    this.draftTime = appointment.startTime;

    this.editorMode.set('reschedule');
  }

  canModify(appointment: Appointment): boolean {
    return ['scheduled', 'confirmed'].includes(
      appointment.status
    );
  }

  closeEditor(): void {
    if (this.saving()) return;

    this.editorMode.set(null);
    this.viewing.set(null);
  }

  async save(): Promise<void> {
    if (this.saving() || !this.editorMode()) return;

    if (
      !validAppointmentTime(this.draftDate, this.draftTime) ||
      new Date(
        `${this.draftDate}T${this.draftTime}:00`
      ).getTime() <= Date.now()
    ) {
      this.error.set('Selecione uma data e horário futuros válidos.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      if (this.editorMode() === 'create') {
        const patient = this.availablePatients().find(
          item => item.id === this.draftPatientId
        );

        if (!patient) {
          throw new Error('Selecione um paciente válido.');
        }

        await this.appointmentService.create({
          patientId: patient.id,
          professionalId: this.selectedProfessionalId(),
          date: this.draftDate,
          startTime: this.draftTime
        });

        this.success.set('Consulta agendada com sucesso.');
      } else {
        const appointment = this.viewing();

        if (!appointment) {
          throw new Error('Consulta não encontrada.');
        }

        await this.appointmentService.reschedule(
          appointment.id,
          this.draftDate,
          this.draftTime
        );

        this.success.set('Consulta reagendada com sucesso.');
      }

      this.editorMode.set(null);
      this.viewing.set(null);
      await this.reloadAppointments();
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a consulta.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async confirmAppointment(): Promise<void> {
    const appointment = this.viewing();

    if (!appointment || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    try {
      await this.appointmentService.changeStatus(
        appointment,
        'confirmed'
      );

      this.closeDetailsAfterAction();
      this.success.set('Consulta confirmada.');
      await this.reloadAppointments();
    } catch {
      this.error.set('Não foi possível confirmar a consulta.');
    } finally {
      this.saving.set(false);
    }
  }

  async finishAppointment(
    status: 'completed' | 'no_show'
  ): Promise<void> {
    const appointment = this.viewing();

    if (!appointment || this.saving()) return;

    this.saving.set(true);
    this.error.set('');

    try {
      await this.appointmentService.changeStatus(
        appointment,
        status
      );

      this.closeDetailsAfterAction();
      this.success.set('Status atualizado.');
      await this.reloadAppointments();
    } catch {
      this.error.set('Não foi possível atualizar a consulta.');
    } finally {
      this.saving.set(false);
    }
  }

  async cancelAppointment(): Promise<void> {
    const appointment = this.viewing();

    if (!appointment || this.saving()) return;

    if (!confirm('Deseja cancelar esta consulta?')) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.appointmentService.cancel(appointment.id);

      this.closeDetailsAfterAction();
      this.success.set('Consulta cancelada e horário liberado.');
      await this.reloadAppointments();
    } catch {
      this.error.set('Não foi possível cancelar a consulta.');
    } finally {
      this.saving.set(false);
    }
  }

  private closeDetailsAfterAction(): void {
    this.viewing.set(null);
    this.editorMode.set(null);
  }
}
