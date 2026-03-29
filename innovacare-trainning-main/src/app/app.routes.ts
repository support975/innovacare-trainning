import { Routes } from '@angular/router';
import { CourseReturnComponent } from './features/learner/course-return/course-return';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  { path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'learner/courses/:courseId/exam/:examId',
    loadComponent: () =>
      import('./features/learner/exam-runner/exam-runner')
        .then(m => m.ExamRunnerComponent),
  },

  { path: 'reset',
    loadComponent: () =>
      import('./features/auth/reset/reset').then(m => m.ResetComponent)
  },

  // LEARNER → lazy-load a Routes array (NOT a single component)
  { path: 'learner',
    loadChildren: () =>
      import('./features/learner/learner.routes').then(m => m.learnerRoutes)
  },
  
  { path: 'manager',
    loadChildren: () =>
      import('./features/manager/manager.routes').then(m => m.ManagerRoutingModule)
  },
  
  


  { path: '**', redirectTo: 'login' }
];
