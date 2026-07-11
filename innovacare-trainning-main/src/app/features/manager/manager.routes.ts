import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ManagerShell } from './manager-shell/manager-shell';
import { authCanMatch } from '../../core/auth.canmatch';
import { roleCanMatch } from '../../core/role.canmatch';
import { planFeatureCanMatch } from '../../core/plan-feature.canmatch';
import { certificationAuthorityCanMatch } from '../../core/certification-authority.canmatch';

const routes: Routes = [
  {
    path: '',
    component: ManagerShell,
    canMatch: [authCanMatch, roleCanMatch(['manager','admin'])],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./manager-dashboard/manager-dashboard').then(m => m.ManagerDashboardComponent),
      },
      {
        path: 'assign',
        canMatch: [planFeatureCanMatch('manager.assign')],
        loadComponent: () => import('./assign/assign').then(m => m.Assign),
      },
      {
        path: 'access-requests',
        canMatch: [planFeatureCanMatch('manager.accessRequests')],
        loadComponent: () =>
          import('./course-access-requests/course-access-requests').then(
            m => m.CourseAccessRequestsComponent
          ),
      },
      {
        path: 'notify',
        canMatch: [planFeatureCanMatch('manager.notify')],
        loadComponent: () => import('./admin-notify/admin-notify').then(m => m.AdminNotify),
      },
      {
        path: 'courses',
        canMatch: [planFeatureCanMatch('manager.courses')],
        loadComponent: () => import('./courses/courses').then(m => m.Courses),
      },
      {
        path: 'official-certifications',
        canMatch: [
          planFeatureCanMatch('manager.officialCertifications'),
          certificationAuthorityCanMatch,
        ],
        loadComponent: () =>
          import('./official-certifications/official-certifications').then(
            m => m.OfficialCertificationsComponent
          ),
      },
      {
        path: 'learners',
        canMatch: [planFeatureCanMatch('manager.learners')],
        loadComponent: () => import('./learners/learners').then(m => m.Learners),
      },
      {
        path: 'wounds',
        canMatch: [planFeatureCanMatch('manager.clinicalResources')],
        loadComponent: () => import('./add-wound/add-wound').then(m => m.AddWound),
      },
      {
        path: 'setting',
        canMatch: [planFeatureCanMatch('manager.settings')],
        loadComponent: () =>
          import('./manager-settings/manager-settings').then(m => m.ManagerSettings),
      },
      {
        path: 'policy/new',
        canMatch: [planFeatureCanMatch('manager.policies')],
        loadComponent: () =>
          import('./policy-admin-editor.page/policy-admin-editor.page').then(
            m => m.PolicyAdminEditorPage
          ),
      },
      {
        path: 'policy/:id/edit',
        canMatch: [planFeatureCanMatch('manager.policies')],
        loadComponent: () =>
          import('./policy-admin-editor.page/policy-admin-editor.page').then(
            m => m.PolicyAdminEditorPage
          ),
      },
      {
        path: 'policy-report',
        canMatch: [planFeatureCanMatch('manager.policies')],
        loadComponent: () =>
          import('./policy-ack-report.page/policy-ack-report.page').then(
            m => m.PolicyAckReportPage
          ),
      },
      {
        path: 'policy-assignments',
        canMatch: [planFeatureCanMatch('manager.policyAssignments')],
        loadComponent: () =>
          import('./policy-assignments/policy-assignments').then(
            m => m.PolicyAssignmentsComponent
          ),
      },
      {
        path: 'policies',
        canMatch: [planFeatureCanMatch('manager.policies')],
        loadComponent: () =>
          import('./policy-library/policy-library').then(
            m => m.PolicyLibraryComponent
          ),
      },
      {
        path: 'audit',
        canMatch: [planFeatureCanMatch('manager.audit')],
        loadComponent: () =>
          import('./audit-center/audit-center').then(
            m => m.AuditCenterComponent
          ),
      },
      {
        path: 'compliance-matrix',
        canMatch: [planFeatureCanMatch('manager.complianceMatrix')],
        loadComponent: () =>
          import('./compliance-matrix/compliance-matrix').then(
            m => m.ComplianceMatrixComponent
          ),
      },
      {
        path: 'exam-blueprint-center',
        canMatch: [
          planFeatureCanMatch('manager.officialCertifications'),
          certificationAuthorityCanMatch,
        ],
        loadComponent: () =>
          import('./exam-blueprint-center/exam-blueprint-center').then(
            m => m.ExamBlueprintCenterComponent
          ),
      },
      {
        path: 'certification-candidate/:applicationId',
        canMatch: [
          planFeatureCanMatch('manager.officialCertifications'),
          certificationAuthorityCanMatch,
        ],
        loadComponent: () =>
          import('./certification-candidates/candidate-management').then(
            m => m.CandidateManagementComponent
          ),
      },
      {
        path: 'member-registry',
        canMatch: [
          planFeatureCanMatch('manager.officialCertifications'),
          certificationAuthorityCanMatch,
        ],
        loadComponent: () =>
          import('./member-registry/member-registry').then(
            m => m.MemberRegistryComponent
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
        path: 'exam-sessions',
        loadComponent: () =>
          import('./exam-sessions-admin/exam-sessions-admin').then(
            m => m.ExamSessionsAdminComponent
          ),
      },
      {
        path: 'onsite-exams',
        loadComponent: () =>
          import('./onsite-exam-center/onsite-exam-center').then(
            m => m.OnsiteExamCenterComponent
          ),
      },
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ManagerRoutingModule {}
