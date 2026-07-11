export interface SuperAdminOrganization {
  id?: string;
  name: string;
  type: OrgType;
  orgId?: string;
  plan: PlanType;
  learnerLimit?: number | null;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  active?: boolean;
  ownerUid?: string | null;
  certificationAuthorityEnabled?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SuperAdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  orgId?: string | null;
  orgType?: OrgType;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SuperAdminLog {
  id?: string;
  type: string;
  actorUid?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  message?: string;
  severity?: 'info' | 'warning' | 'critical';
  createdAt?: any;
  meta?: Record<string, any>;
}

export interface SuperAdminBillingRecord {
  id?: string;
  orgId: string;
  orgName?: string;
  plan: PlanType;
  learnerLimit?: number | null;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  amount?: number;
  currency?: string;
  periodStart?: any;
  periodEnd?: any;
  updatedAt?: any;
}

export interface SuperAdminDashboardStats {
  organizations: number;
  users: number;
  activeOrganizations: number;
  activeUsers: number;
  billingActive: number;
  criticalLogs: number;
}
export interface OrganizationCourseAssignment {
  id?: string;
  orgId: string;
  courseId: string;
  assignedAt?: any;
  assignedByUid?: string | null;
  assignedByEmail?: string | null;
  active?: boolean;
}
export type OrgType = 'health' | 'IT' | 'school';
export type PlanType = 'free' | 'pro' | 'enterprise';
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'learner' | 'guest';

export interface SuperAdminOrganization {
  id?: string;
  name: string;
  type: OrgType;
  plan: PlanType;
  learnerLimit?: number | null;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  active?: boolean;
  ownerUid?: string | null;
  ownerEmail?: string | null;
  certificationAuthorityEnabled?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SuperAdminUser {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  orgId?: string | null;
  orgType?: OrgType;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SuperAdminLog {
  id?: string;
  type: string;
  actorUid?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  message?: string;
  severity?: 'info' | 'warning' | 'critical';
  createdAt?: any;
  meta?: Record<string, any>;
}

export interface SuperAdminBillingRecord {
  id?: string;
  orgId: string;
  orgName?: string;
  plan: PlanType;
  learnerLimit?: number | null;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  amount?: number;
  currency?: string;
  periodStart?: any;
  periodEnd?: any;
  updatedAt?: any;
}

export interface OrganizationCourseAssignment {
  id?: string;
  orgId: string;
  courseId: string;
  assignedAt?: any;
  assignedByUid?: string | null;
  assignedByEmail?: string | null;
  active?: boolean;
}
