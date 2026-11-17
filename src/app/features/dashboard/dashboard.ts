import {
  Component,
  computed,
  inject,
  OnInit,
  signal
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { MemberService }
  from '../../core/auth/member.service';

import { AppointmentService }
  from '../../core/services/appointment.service';

import { PatientService }
  from '../../core/services/patient.service';

import { ProfessionalService }
  from '../../core/services/professional.service';

import type { Appointment }
  from '../../core/models/appointment.model';

import {
  APPOINTMENT_STATUSES
} from '../../core/models/appointment.model';

import type { Patient }
  from '../../core/models/patient.model';

import type { Professional }
  from '../../core/models/professional.model';

type ScheduledPatient = Appointment & {
  patient: Patient;
  professional: Professional;
};

function localDateInput(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);

  return localDateInput(date);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  private readonly members = inject(MemberService);
  private readonly appointmentService =
    inject(AppointmentService);
  private readonly patientService = inject(PatientService);
  private readonly professionalService =
    inject(ProfessionalService);

  readonly scheduledPatients = signal<ScheduledPatient[]>([]);
  readonly loadingAppointments = signal(false);
  readonly appointmentsError = signal('');
  readonly agendaAvailable = signal(false);

  readonly appointmentRangeLabel = computed(() => {
    const first = this.scheduledPatients()[0];
    const last = this.scheduledPatients().at(-1);

    if (!first || !last) return 'Hoje e proximos 7 dias';

    return `${this.formatDate(first.date)} a ${this.formatDate(last.date)}`;
  });

  ngOnInit(): void {
    void this.loadScheduledPatients();
  }

  async loadScheduledPatients(): Promise<void> {
    this.loadingAppointments.set(true);
    this.appointmentsError.set('');

    try {
      const member = await this.members.refresh();

      if (
        !member ||
        !['admin', 'receptionist'].includes(member.role)
      ) {
        this.agendaAvailable.set(false);
        this.scheduledPatients.set([]);
        return;
      }

      this.agendaAvailable.set(true);

      const startDate = localDateInput(new Date());
      const endDate = addDays(startDate, 8);

      const [appointments, patients, professionals] =
        await Promise.all([
          this.appointmentService.list(startDate, endDate),
          this.patientService.list(),
          this.professionalService.list()
        ]);

      const patientsById = new Map(
        patients.map(patient => [patient.id, patient])
      );
      const professionalsById = new Map(
        professionals.map(professional => [
          professional.id,
          professional
        ])
      );

      const scheduled = appointments
        .filter(item =>
          ['scheduled', 'confirmed'].includes(item.status)
        )
        .map(item => {
          const patient = patientsById.get(item.patientId);
          const professional = professionalsById.get(
            item.professionalId
          );

          return patient && professional
            ? { ...item, patient, professional }
            : null;
        })
        .filter(
          (item): item is ScheduledPatient => item !== null
        )
        .sort((a, b) =>
          `${a.date}${a.startTime}`.localeCompare(
            `${b.date}${b.startTime}`
          )
        );

      this.scheduledPatients.set(scheduled);
    } catch (error) {
      this.scheduledPatients.set([]);
      this.appointmentsError.set(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel carregar os pacientes agendados.'
      );
    } finally {
      this.loadingAppointments.set(false);
    }
  }

  formatDate(value: string): string {
    const date = new Date(`${value}T12:00:00`);

    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
  }

  statusLabel(status: Appointment['status']): string {
    return APPOINTMENT_STATUSES[status];
  }
}
