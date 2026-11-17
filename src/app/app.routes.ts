
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
        path: 'professionals',
        title: 'Profissionais | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin', 'receptionist']
        },
        loadComponent: () =>
          import('./features/professionals/professionals')
            .then(m => m.Professionals)
      },
      {
        path: 'members',
        title: 'Acessos | PsyCare',
        canActivate: [roleGuard],
        data: {
          roles: ['admin']
        },
        loadComponent: () =>
          import('./features/members/members')
            .then(m => m.Members)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
