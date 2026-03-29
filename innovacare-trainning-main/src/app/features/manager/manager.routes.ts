import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Assign } from './assign/assign';
import { Courses } from './courses/courses';
import { Learners } from './learners/learners';
import { Reports } from './reports/reports';
import { ManagerDashboardComponent } from './manager-dashboard/manager-dashboard';
import { ManagerShell } from './manager-shell/manager-shell';
import { authCanMatch } from '../../core/auth.canmatch';
import { roleCanMatch } from '../../core/role.canmatch';
import { ManagerSettings } from './manager-settings/manager-settings';
import { AddWound } from './add-wound/add-wound';
import { PolicyAckReportPage } from './policy-ack-report.page/policy-ack-report.page';
import { PolicyAdminEditorPage } from './policy-admin-editor.page/policy-admin-editor.page';
import { AdminNotify} from './admin-notify/admin-notify';

const routes: Routes = [
  {
    path: '',
    component: ManagerShell,
    canMatch: [authCanMatch, roleCanMatch(['manager','admin'])],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: ManagerDashboardComponent },           // /manager
      { path: 'assign', component:  Assign },
      { path: 'notify', component:  AdminNotify },
      { path: 'courses', component: Courses },
      { path: 'learners',  component: Learners },
      { path: 'wounds',  component: AddWound },
      { path: 'reports',  component: Reports },
      { path: 'setting',  component: ManagerSettings },
      { path: 'policy/new', component: PolicyAdminEditorPage },
      { path: 'policy/:id/edit', component: PolicyAdminEditorPage },
      { path: 'policy-report', component: PolicyAckReportPage },

      {
        path: 'courses/new',
        component: Courses
      },

      {
        path: 'courses/:id/edit',
        component: Courses
      },
      {
        path: 'courses/:id/extras',
        loadComponent: () =>
          import('./courses-editor/courses-editor').then(m => m.CoursesEditor)
      }

    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ManagerRoutingModule {}

