export type AppPlan = 'free' | 'pro' | 'enterprise';

export type PlanFeature =
  | 'manager.dashboard'
  | 'manager.assign'
  | 'manager.accessRequests'
  | 'manager.notify'
  | 'manager.courses'
  | 'manager.learners'
  | 'manager.audit'
  | 'manager.complianceMatrix'
  | 'manager.policies'
  | 'manager.policyAssignments'
  | 'manager.settings'
  | 'manager.clinicalResources'
  | 'manager.officialCertifications';

export type PlanEntitlements = {
  plan: AppPlan;
  publicName: string;
  learnerLimit: number | null;
  summary: string;
  features: readonly PlanFeature[];
};

export const PLAN_ENTITLEMENTS: Record<AppPlan, PlanEntitlements> = {
  free: {
    plan: 'free',
    publicName: 'Starter',
    learnerLimit: 25,
    summary: 'Core LMS for small teams: learner tracking, course library, and basic assignment.',
    features: [
      'manager.dashboard',
      'manager.assign',
      'manager.courses',
      'manager.learners',
    ],
  },
  pro: {
    plan: 'pro',
    publicName: 'Growth',
    learnerLimit: 100,
    summary: 'Advanced management for growing teams: requests, communications, policies, audit and compliance.',
    features: [
      'manager.dashboard',
      'manager.assign',
      'manager.accessRequests',
      'manager.notify',
      'manager.courses',
      'manager.learners',
      'manager.audit',
      'manager.complianceMatrix',
      'manager.policies',
      'manager.policyAssignments',
      'manager.settings',
      'manager.clinicalResources',
      'manager.officialCertifications',
    ],
  },
  enterprise: {
    plan: 'enterprise',
    publicName: 'Enterprise',
    learnerLimit: null,
    summary: 'Full platform access with enterprise governance and specialized resources.',
    features: [
      'manager.dashboard',
      'manager.assign',
      'manager.accessRequests',
      'manager.notify',
      'manager.courses',
      'manager.learners',
      'manager.audit',
      'manager.complianceMatrix',
      'manager.policies',
      'manager.policyAssignments',
      'manager.settings',
      'manager.clinicalResources',
      'manager.officialCertifications',
    ],
  },
};

export function normalizePlan(value: unknown): AppPlan {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'starter') return 'free';
  if (plan === 'growth') return 'pro';
  if (plan === 'free' || plan === 'pro' || plan === 'enterprise') return plan;
  return 'free';
}

export function entitlementsForPlan(value: unknown): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlan(value)];
}

export function planHasFeature(plan: unknown, feature: PlanFeature): boolean {
  return entitlementsForPlan(plan).features.includes(feature);
}
