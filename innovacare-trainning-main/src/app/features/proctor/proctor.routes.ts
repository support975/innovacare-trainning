import { Routes } from '@angular/router';
import { roleCanMatch } from '../../core/role.canmatch';

export const proctorRoutes: Routes = [
  {
    path: 'sessions/:sessionId',
    loadComponent: () =>
      import('./proctor-dashboard/proctor-dashboard').then(
        m => m.ProctorDashboardComponent
      )
  },

  {
    path: 'monitor/:sessionId',
    loadComponent: () =>
      import('./session-monitor/session-monitor').then(
        m => m.SessionMonitorComponent
      )
  },
];
