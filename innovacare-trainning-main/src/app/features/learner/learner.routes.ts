// src/app/features/learner/learner.routes.ts  (or wherever you keep learnerRoutes)
import { Routes } from '@angular/router';

import { authCanMatch } from '../../core/auth.canmatch';
import { nonIndividualLearnerCanMatch } from '../../core/non-individual-learner.canmatch';
import { roleCanMatch } from '../../core/role.canmatch';
import { LearnerShell } from './shell/learner-shell/learner-shell';

export const learnerRoutes: Routes = [
  {
    path: '',
    component: LearnerShell,
    canMatch: [authCanMatch, roleCanMatch(['learner'])],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./learner-dashboard/learner-dashboard').then(m => m.LearnerDashboardComponent),
      },
      {
        path: 'assignments',
        loadComponent: () =>
          import('./assignments/learner-assignments/learner-assignments').then(
            m => m.LearnerAssignments
          ),
      },
      {
        path: 'certifications',
        loadComponent: () =>
          import('./certifications/certifications/certifications').then(m => m.Certifications),
      },
      {
        path: 'official-certifications',
        loadComponent: () =>
          import('./official-certifications/official-certifications').then(
            m => m.LearnerOfficialCertificationsComponent
          ),
      },
      {
        path: 'onsite-exams',
        loadComponent: () =>
          import('./onsite-exams/onsite-exams').then(
            m => m.LearnerOnsiteExamsComponent
          ),
      },
      {
        path: 'official-certifications/:applicationId/exam',
        loadComponent: () =>
          import('./official-certifications/official-exam-launch').then(
            m => m.OfficialExamLaunchComponent
          ),
      },
      {
        path: 'official-certifications/:applicationId/blueprint-exam/:blueprintId',
        loadComponent: () =>
          import('./official-certifications/blueprint-exam-runner').then(
            m => m.BlueprintExamRunnerComponent
          ),
      },
      {
        path: 'certification-candidate/:applicationId',
        loadComponent: () =>
          import('./certification-candidate/candidate-profile').then(
            m => m.CandidateProfileComponent
          ),
      },
      {
        path: 'verify-member',
        loadComponent: () =>
          import('../publics/member-verification/member-verification').then(
            m => m.MemberVerificationComponent
          ),
      },
      {
        path: 'library',
        canMatch: [nonIndividualLearnerCanMatch],
        loadComponent: () => import('./library/library/library').then(m => m.Library),
      },
      {
        path: 'transcript',
        loadComponent: () => import('./transcript/transcript/transcript').then(m => m.Transcript),
      },

      // Organization quick practice zone and detail
      {
        path: 'wound',
        canMatch: [nonIndividualLearnerCanMatch],
        loadComponent: () =>
          import('./woundLabrary/wound-labrary-list/wound-labrary-list').then(
            m => m.WoundLabraryTableComponent
          ),
      },
      {
        path: 'wound/:id',
        canMatch: [nonIndividualLearnerCanMatch],
        loadComponent: () =>
          import('./woundLabrary/wound-labrary-details/wound-labrary-details').then(
            m => m.WoundLibraryDetailComponent
          ),
      },
      {
        path: 'rewards',
        loadComponent: () => import('./rewards/rewards/rewards').then(m => m.Rewards),
      },

      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notification-center/notification-center').then(
            m => m.NotificationCenterComponent
          ),
      },

      {
        path: 'policies',
        canMatch: [nonIndividualLearnerCanMatch],
        loadComponent: () => import('./policy/policy-list/policy-list').then(m => m.PolicyList),
      },
      {
        path: 'policies/:id',
        canMatch: [nonIndividualLearnerCanMatch],
        loadComponent: () =>
          import('./policy/policy-details/policy-details').then(m => m.PolicyDetails),
      },
      {
        path: 'profile',
        canMatch: [nonIndividualLearnerCanMatch],
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
          import('./exam-runner/exam-runner').then(m => m.ExamRunnerComponent),
      },
    ],
  },
];
