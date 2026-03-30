import { Routes } from '@angular/router';
import { roleCanMatch } from './core/role.canmatch';


export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.LoginComponent)
  },

  {
    path: 'learner/courses/:courseId/exam/:examId',
    loadComponent: () =>
      import('./features/learner/exam-runner/exam-runner')
        .then(m => m.ExamRunnerComponent),
  },

  {
    path: 'reset',
    loadComponent: () =>
      import('./features/auth/reset/reset').then(m => m.ResetComponent)
  },

  {
    path: 'learner',
    canMatch: [roleCanMatch(['learner'])],
    loadChildren: () =>
      import('./features/learner/learner.routes').then(m => m.learnerRoutes)
  },

  {
    path: 'manager',
    canMatch: [roleCanMatch(['admin', 'manager'])],
    loadChildren: () =>
      import('./features/manager/manager.routes').then(m => m.ManagerRoutingModule)
  },

  {
    path: 'super-admin',
    canMatch: [roleCanMatch(['super_admin'])],
    loadChildren: () =>
      import('./features/superAdmin/super-admin.routes').then(m => m.SUPER_ADMIN_ROUTES)
  },

  { path: '**', redirectTo: 'login' }
];