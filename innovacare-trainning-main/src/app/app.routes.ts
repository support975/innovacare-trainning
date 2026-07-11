import { Routes } from '@angular/router';
import { roleCanMatch } from './core/role.canmatch';


export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/home' },

  {
    path: 'home',
    loadComponent: () =>
      import('./features/publics/training-landing/training-landing').then(
        (m) => m.TrainingLandingComponent
      )
  },

  {
    path: 'ordre-professionnel',
    loadComponent: () =>
      import('./features/auth/public-landing/landing').then(m => m.PublicLandingComponent)
  },


  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.LoginComponent)
  },

  {
    path: 'login-org',
    loadComponent: () =>
      import('./features/auth/org-login/org-login').then(m => m.OrgLoginComponent)
  },

  {
    path: 'register-organization',
    loadComponent: () =>
      import('./features/auth/org-register/org-register').then(m => m.OrgRegisterComponent)
  },

  {
    path: 'signup',
    loadComponent: () =>
      import('./features/auth/signup/signup').then(m => m.SignupComponent)
  },

  {
    path: 'kiosk',
    loadComponent: () =>
      import('./features/learner/kiosk-setup/kiosk-setup')
        .then(m => m.KioskSetupComponent),
  },

  {
    path: 'exam-session-login',
    loadComponent: () =>
      import('./features/learner/exam-session-login/exam-session-login')
        .then(m => m.ExamSessionLoginComponent),
  },

  {
    path: 'kiosk-exam/:sessionId/:stationId',
    loadComponent: () =>
      import('./features/learner/kiosk-exam-login/kiosk-exam-login')
        .then(m => m.KioskExamLoginComponent),
  },

  {
    path: 'exam-session-consent',
    loadComponent: () =>
      import('./features/learner/exam-session-consent/exam-session-consent')
        .then(m => m.ExamSessionConsentComponent),
  },

  {
    path: 'exam-session-proctor-verify',
    loadComponent: () =>
      import('./features/learner/exam-session-proctor-verify/exam-session-proctor-verify')
        .then(m => m.ExamSessionProctorVerifyComponent),
  },

  {
    path: 'exam-session-launcher',
    loadComponent: () =>
      import('./features/learner/exam-session-launcher/exam-session-launcher')
        .then(m => m.ExamSessionLauncherComponent),
  },

  {
    path: 'exam-session-runner',
    loadComponent: () =>
      import('./features/learner/official-certifications/blueprint-exam-runner')
        .then(m => m.BlueprintExamRunnerComponent),
  },

  {
    path: 'exam-results',
    loadComponent: () =>
      import('./features/learner/exam-results/exam-results')
        .then(m => m.ExamResultsComponent),
  },

  {
    path: 'exam-reinscription',
    loadComponent: () =>
      import('./features/learner/exam-reinscription/exam-reinscription')
        .then(m => m.ExamReinscriptionComponent),
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
    path: 'proctor',
    canMatch: [roleCanMatch(['proctor', 'admin', 'manager', 'super_admin'])],
    loadChildren: () =>
      import('./features/proctor/proctor.routes').then(m => m.proctorRoutes)
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

  {
    path: 'org/:orgId/dashboard',
    loadComponent: () =>
      import('./features/organization/org-dashboard/org-dashboard').then(
        (m) => m.OrgDashboardComponent
      )
  },

  {
    path: 'public-home',
    loadComponent: () =>
      import('./features/publics/training-landing/training-landing').then(
        (m) => m.TrainingLandingComponent
      ),
  },
   {
    path: 'fonctionnalites',
    loadComponent: () =>
      import('./features/publics/features/features-page').then(
        (m) => m.FeaturesPage
      ),
  },
  {
    path: 'industries',
    loadComponent: () =>
      import('./features/publics/industries/industries-page').then(
        (m) => m.IndustriesPage
      ),
  },
   {
    path: 'pricing',
    loadComponent: () =>
      import('./features/publics/pricing/pricing-page').then(
        (m) => m.PricingPage
      ),
  },
  {
    path: 'catalogue',
    loadComponent: () =>
      import('./features/publics/catalogue-page/catalogue-page').then(
        (m) => m.CataloguePage 
      ),
  },
   {
    path: 'catalogue/:id',
    loadComponent: () =>
      import('./features/publics/course-detail-page/course-detail-page').then(
        (m) => m.CourseDetailPage
      ),
  },

  { path: '**', redirectTo: '/home' }
];
