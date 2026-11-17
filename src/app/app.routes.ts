
import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar | PsyCare',
    loadComponent: () =>
      import('./features/auth/login/login')
        .then(m => m.Login)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout')
        .then(m => m.MainLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        title: 'Painel | PsyCare',
        loadComponent: () =>
          import('./features/dashboard/dashboard')
            .then(m => m.Dashboard)
      },

      {
        path: 'documents',
        title: 'Documentos | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'psychologist']
        },
        loadComponent: () =>
          import('./features/documents/documents')
            .then(m => m.Documents)
      },

      {
        path: 'appointments',
        title: 'Agenda | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'receptionist', 'secretary']
        },
        loadComponent: () =>
          import('./features/appointments/appointments')
            .then(m => m.Appointments)
      },
      {
        path: 'patients',
        title: 'Pacientes | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'receptionist', 'secretary']
        },
        loadComponent: () =>
          import('./features/patients/patients')
            .then(m => m.Patients)
      },
      {
        path: 'professionals',
        title: 'Profissionais | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'receptionist', 'secretary']
        },
        loadComponent: () =>
          import('./features/professionals/professionals')
            .then(m => m.Professionals)
      },
      {
        path: 'clinical',
        title: 'Prontuários e avaliações | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'psychologist']
        },
        loadComponent: () =>
          import('./features/clinical/clinical')
            .then(m => m.Clinical)
      },
      {
        path: 'members',
        title: 'Usuários e acessos | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin']
        },
        loadComponent: () =>
          import('./features/members/members')
            .then(m => m.Members)
      },

      {
        path: 'financial',
        title: 'Financeiro | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: [
            'admin',
            'psychologist',
            'receptionist',
            'secretary'
          ]
        },
        loadComponent: () =>
          import('./features/financial/financial')
            .then(m => m.Financial)
      },

    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
