import { Routes } from '@angular/router';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/shell').then(m => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'organizations',
        loadComponent: () =>
          import('./organizations/organizations').then(m => m.Organizations),
      },
      {
        path: 'setup',
        loadComponent: () =>
          import('./setup/setup').then(m => m.Setup),
      },
      {
  path: 'users',
  loadComponent: () =>
    import('./users/users').then(m => m.Users),
},
      {
        path: 'billing',
        loadComponent: () =>
          import('./billing/billing').then(m => m.Billing),
      },
      {
        path: 'demo-requests',
        loadComponent: () =>
          import('./demo-requests/demo-requests').then(m => m.DemoRequestsComponent),
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('./log/log').then(m => m.Log),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/settings').then(m => m.Settings),
      },
      {
        path: 'organizations/create',
        loadComponent: () =>
          import('./organizationsPage/create/create').then(m => m.Create),
      },
      {
        path: 'organizations/:id/edit',
        loadComponent: () =>
          import('./organizationsPage/edit/edit').then(m => m.Edit),
      },
      {
        path: 'organizations/:id/delete',
        loadComponent: () =>
          import('./organizationsPage/delete/delete').then(m => m.Delete),
      },
      {
        path: 'organizations/:id',
        loadComponent: () =>
          import('./organizationsPage/org-details/org-details').then(m => m.OrgDetails),
      },
      {
        path: 'course-assignments',
        loadComponent: () =>
          import('./organizationsPage/course-assign/course-assign').then(m => m.CourseAssign),
      },
      {
        path: 'learning-paths',
        loadComponent: () =>
          import('./learning-paths/learning-paths').then(m => m.LearningPathsComponent),
      },
      {
        path: 'exam-authoring',
        loadComponent: () =>
          import('./exam-authoring/exam-authoring').then(m => m.ExamAuthoringComponent),
      },
      {
        path: 'policy-assignments',
        loadComponent: () =>
          import('./policy-assignments/policy-assignments').then(
            m => m.SuperAdminPolicyAssignmentsComponent
          ),
      },
      {
        path: 'courses',
        loadComponent: () =>
          import('../manager/courses/courses').then(m => m.Courses),
      },
      {
        path: 'courses/:id/extras',
        loadComponent: () =>
          import('../manager/courses-editor/courses-editor').then(m => m.CoursesEditor),
      },
      {
        path: '**',
        redirectTo: 'dashboard',
      },
    ],
  },
];
