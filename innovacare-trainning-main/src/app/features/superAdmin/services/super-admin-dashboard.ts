import { Injectable, inject } from '@angular/core';
import { SuperAdminDashboardService } from './super-admin-facade';
import { SuperAdminBillingService } from './super-admin-billing';
import { SuperAdminLogsService } from './super-admin-logs';
import { SuperAdminOrganizationsService } from './super-admin-organizations';
import { SuperAdminUsersService } from './super-admin-users';


@Injectable({ providedIn: 'root' })
export class SuperAdminFacadeService {
  dashboard = inject(SuperAdminDashboardService);
  organizations = inject(SuperAdminOrganizationsService);
  users = inject(SuperAdminUsersService);
  billing = inject(SuperAdminBillingService);
  logs = inject(SuperAdminLogsService);
}