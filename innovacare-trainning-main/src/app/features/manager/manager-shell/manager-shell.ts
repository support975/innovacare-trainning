import { Component, DestroyRef, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { filter } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { ActingOrgService } from '../../../core/organization/services/acting-org.service';
import { LanguageService } from '../../../shared/services/language';
import { DemoService } from '../../../shared/services/demo.service';
import { NotificationBellPlainComponent } from '../../../shared/components/notifications/notification-bell-plain/notification-bell-plain';
import {
  PlanFeature,
  entitlementsForPlan,
  planHasFeature,
} from '../../../shared/billing/plan-entitlements';

type OrganizationShellDoc = {
  name?: string;
  plan?: string;
  learnerLimit?: number | null;
  certificationAuthorityEnabled?: boolean;
  canCreateSubOrgs?: boolean;
  isDemo?: boolean;
  demoExpiresAt?: { toDate?: () => Date } | null;
  features?: {
    officialCertifications?: boolean;
  };
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
};

type ShellMenuItem = {
  path: string;
  label: string;
  icon: string;
  hint: string;
  feature: PlanFeature;
  requiresCertificationAuthority?: boolean;
  requiresCouncil?: boolean;
  /** false = hidden while acting as a facility (page hasn't been retrofitted to follow the acting org yet). Defaults to true. */
  actingModeSupported?: boolean;
};

type ShellMenuSection = {
  label: string;
  items: ShellMenuItem[];
};

function safeBrandColor(value?: string): string {
  const color = value?.trim();
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#00a79d';
}

@Component({
  selector: 'app-manager-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationBellPlainComponent],
  templateUrl: './manager-shell.html',
  styleUrl: './manager-shell.css'
})
export class ManagerShell {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly authSvc = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private readonly orgContext = inject(ActingOrgService);
  private readonly demoSvc = inject(DemoService);
  readonly lang = inject(LanguageService);

  sidebarOpen = signal(false);
  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  closeSidebar()  { this.sidebarOpen.set(false); }

  // Real signed-in identity (name/avatar) — never swapped while acting.
  private readonly profile = toSignal(this.authSvc.profile$, { initialValue: null });

  // Branding/plan/nav-gating follow the EFFECTIVE org: the corp admin's own
  // org normally, or the facility being acted on. This is what makes acting
  // mode work with zero changes to organizationName/Logo/Accent/plan below.
  private readonly organization = toSignal(
    toObservable(this.orgContext.effectiveOrgId).pipe(
      switchMap((orgId) => {
        if (!orgId) return of(null);
        return docData(doc(this.firestore, `organizations/${orgId}`)).pipe(
          map((org) => (org || null) as OrganizationShellDoc | null)
        );
      })
    ),
    { initialValue: null as OrganizationShellDoc | null }
  );

  readonly isActing = this.orgContext.isActing;
  readonly actingOrgName = this.orgContext.actingOrgName;
  exitActing() { this.orgContext.stopActing(); }

  readonly isDemo = computed(() => this.profile()?.isDemo === true || this.organization()?.isDemo === true);

  readonly demoDaysLeft = computed(() => {
    const expiresAt = this.organization()?.demoExpiresAt?.toDate?.();
    if (!expiresAt) return null;
    const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
    return Math.max(0, days);
  });

  readonly switchingDemoView = signal(false);
  readonly demoSwitchError = signal('');

  async viewAsLearner(): Promise<void> {
    if (this.switchingDemoView()) return;
    this.switchingDemoView.set(true);
    this.demoSwitchError.set('');
    try {
      await this.demoSvc.switchTo('learner');
      await this.router.navigate(['/learner']);
    } catch (e: any) {
      this.demoSwitchError.set(e?.message || this.lang.t('demo.banner.switchErrorLearner'));
    } finally {
      this.switchingDemoView.set(false);
    }
  }

  readonly displayName = computed(() => {
    const profile = this.profile();
    return profile?.displayName?.trim() || profile?.email?.trim() || 'Manager';
  });

  readonly organizationName = computed(() => {
    const profile = this.profile();
    return this.organization()?.name?.trim() || profile?.orgId || 'No organization';
  });

  readonly organizationLogoUrl = computed(() =>
    this.organization()?.branding?.logoUrl?.trim() || ''
  );

  readonly organizationAccent = computed(() =>
    safeBrandColor(this.organization()?.branding?.primaryColor)
  );

  readonly planEntitlements = computed(() =>
    entitlementsForPlan(this.organization()?.plan)
  );

  readonly planName = computed(() => this.planEntitlements().publicName);

  readonly planLimitLabel = computed(() => {
    const limit = this.organization()?.learnerLimit ?? this.planEntitlements().learnerLimit;
    return limit ? `${limit} learners included` : 'Custom learner capacity';
  });

  readonly certificationAuthorityEnabled = computed(() => {
    const profile = this.profile();
    const org = this.organization();
    const hasPermission = (profile?.permissions || []).some(permission =>
      permission.startsWith('certification.')
    );
    return hasPermission ||
      org?.certificationAuthorityEnabled === true ||
      org?.features?.officialCertifications === true;
  });

  readonly isCouncil = computed(() => this.organization()?.canCreateSubOrgs === true);

  readonly avatarUrl = computed(() => {
    const profile = this.profile();
    return profile?.profileImage?.trim() || profile?.photoURL?.trim() || '';
  });

  readonly initials = computed(() => {
    const source = this.displayName();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });

  private readonly baseSections: ShellMenuSection[] = [
    {
      label: 'Operations',
      items: [
        { path: '/manager/dashboard', label: 'Command Center', icon: '◉', hint: 'KPIs, readiness and alerts', feature: 'manager.dashboard' },
        { path: '/manager/assign', label: 'Assignment Center', icon: '◷', hint: 'Bulk assign and due dates', feature: 'manager.assign' },
        { path: '/manager/access-requests', label: 'Access Requests', icon: '◇', hint: 'Approve individual access and payment', feature: 'manager.accessRequests', actingModeSupported: false },
        { path: '/manager/learners', label: 'Learner Directory', icon: '◎', hint: 'Track learner activity', feature: 'manager.learners' },
        { path: '/manager/courses', label: 'Course Library', icon: '▤', hint: 'Review approved courses', feature: 'manager.courses' },
        { path: '/manager/exam-sessions', label: 'Kiosk Exam Sessions', icon: '🖥️', hint: 'Manage exam centers and secure kiosk sessions', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/onsite-exams', label: 'Onsite Exam Center', icon: '🏛️', hint: 'Results, publication and card delivery for kiosk exams', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/remote-proctoring-review', label: 'Remote Proctoring Review', icon: '🌐', hint: 'Review flagged incidents for remote (diaspora) candidates', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/official-certifications', label: 'Official Certifications', icon: '◆', hint: 'Certification sessions and candidate orchestration', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/exam-blueprint-center', label: 'Exam Blueprint Center', icon: '◐', hint: 'Create and manage exam blueprints for sessions', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/member-registry', label: 'Member Registry', icon: '☰', hint: 'Verify members registered on the roster', feature: 'manager.officialCertifications', requiresCertificationAuthority: true, actingModeSupported: false },
        { path: '/manager/verify-member', label: 'Verify Membership', icon: '✓', hint: 'Look up a single member by number', feature: 'manager.dashboard', requiresCertificationAuthority: true, actingModeSupported: false },
      ],
    },
    {
      label: 'Recognition',
      items: [
        { path: '/manager/rewards-center', label: 'Rewards Center', icon: '🏆', hint: 'Grant recognition and track learner achievement', feature: 'manager.rewardsCenter', actingModeSupported: false },
      ],
    },
    {
      label: 'Compliance',
      items: [
        { path: '/manager/audit', label: 'Audit & Acknowledgements', icon: '≣', hint: 'Evidence, attestations, policy status', feature: 'manager.audit', actingModeSupported: false },
        { path: '/manager/compliance-matrix', label: 'Compliance Matrix', icon: '▦', hint: 'Learners vs required courses', feature: 'manager.complianceMatrix', actingModeSupported: false },
        { path: '/manager/policies', label: 'Policy Library', icon: '✦', hint: 'Create, edit and review policy governance', feature: 'manager.policies', actingModeSupported: false },
        { path: '/manager/policy-assignments', label: 'Policy Assignment', icon: '✓', hint: 'Assign tenant policies to learners', feature: 'manager.policyAssignments', actingModeSupported: false },
        { path: '/manager/setting', label: 'Governance Settings', icon: '⚙', hint: 'Program and notification rules', feature: 'manager.settings' },
      ],
    },
    {
      label: 'Communications',
      items: [
        { path: '/manager/notify', label: 'Notifications', icon: '✉', hint: 'Broadcast reminders and updates', feature: 'manager.notify', actingModeSupported: false },
        { path: '/manager/communication-center', label: 'Communication Center', icon: '📣', hint: 'Draft newsletters, campaigns and audience segments', feature: 'manager.notify', actingModeSupported: false },
        { path: '/manager/wounds', label: 'Quick Practice Zone', icon: '✚', hint: 'Org quick sheets and task refreshers', feature: 'manager.clinicalResources', actingModeSupported: false },
      ],
    },
    {
      label: 'Organization',
      items: [
        { path: '/ordre-professionnel', label: 'Public Organization Page', icon: '🌐', hint: 'View your organization public page', feature: 'manager.dashboard' },
        { path: '/manager/council', label: 'Facilities', icon: '🏛️', hint: 'Create and oversee the facilities under your organization', feature: 'manager.dashboard', requiresCouncil: true },
      ],
    },
  ];

  sections = computed(() =>
    this.baseSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          planHasFeature(this.organization()?.plan, item.feature) &&
          (!item.requiresCertificationAuthority || this.certificationAuthorityEnabled()) &&
          (!item.requiresCouncil || this.isCouncil()) &&
          (!this.isActing() || item.actingModeSupported !== false)
        ),
      }))
      .filter((section) => section.items.length > 0)
  );

  constructor() {
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.breakpointObserver.isMatched('(max-width: 860px)')) this.closeSidebar();
      });
  }

  async logout() {
    await this.authSvc.logout();
    this.router.navigate(['/home']);
  }
}
