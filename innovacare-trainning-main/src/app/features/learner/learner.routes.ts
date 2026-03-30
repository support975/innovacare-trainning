// src/app/features/learner/learner.routes.ts  (or wherever you keep learnerRoutes)
import { Routes } from '@angular/router';

import { authCanMatch } from '../../core/auth.canmatch';
import { roleCanMatch } from '../../core/role.canmatch';
import { LearnerDashboardComponent } from './learner-dashboard/learner-dashboard';
import { LearnerAssignments } from './assignments/learner-assignments/learner-assignments';
import { Certifications } from './certifications/certifications/certifications';
import { Library } from './library/library/library';
import { Transcript } from './transcript/transcript/transcript';
import { Rewards } from './rewards/rewards/rewards';
import { LearnerShell } from './shell/learner-shell/learner-shell';

// WOUND library/list/detail imports (fixed paths & filenames)
import { WoundLabrary } from './woundLabrary/wound-labrary/wound-labrary';
import { WoundLabraryTableComponent } from './woundLabrary/wound-labrary-list/wound-labrary-list';
import { WoundLibraryDetailComponent } from './woundLabrary/wound-labrary-details/wound-labrary-details';
import { PolicyList } from './policy/policy-list/policy-list';
import { PolicyDetails } from './policy/policy-details/policy-details';

export const learnerRoutes: Routes = [
  {
    path: '',
    component: LearnerShell,
    canMatch: [authCanMatch, roleCanMatch(['learner'])],
    children: [
      { path: '', component: LearnerDashboardComponent },
      { path: 'assignments', component: LearnerAssignments },
      { path: 'certifications', component: Certifications },
      { path: 'library', component: Library },
      { path: 'transcript', component: Transcript },

      // Wound library (list/table) and detail
      { path: 'wound', component: WoundLabraryTableComponent },
      { path: 'wound/:id', component: WoundLibraryDetailComponent },
      { path: 'rewards', component: Rewards },

      { path: 'policies', component: PolicyList },
      { path: 'policies/:id', component: PolicyDetails },
      {
        path: 'profile',
        loadComponent: () =>
          import('./profile/profile-page/profile-page').then(m => m.ProfilePage),
      },
      

   
      

      // Courses
      {
        path: 'courses/:id',
        loadComponent: () =>
          import('./courses/course-detail/course-detail').then(m => m.CourseDetail),
      },
      {
        path: 'courses/:id/view',
        loadComponent: () =>
          import('./courses/course-player/course-player').then(m => m.CoursePlayer),
      },
      {
        path: 'courses/:id/exam/:examId',
        loadComponent: () =>
          import('./courses/course-exam/course-exam').then(m => m.CourseExam),
      },
    ],
  },
];
