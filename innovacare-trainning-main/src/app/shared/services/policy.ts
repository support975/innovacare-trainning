import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom, filter, take } from 'rxjs';
import { AuthService, AppProfile } from '../../core/auth';
import {
  Policy,
  PolicyAcknowledgement,
  PolicyAssignment,
} from '../../features/learner/policy/model/policy.model';

type ListPolicyOptions = {
  includeArchived?: boolean;
  latest?: boolean;
  limit?: number;
};

@Injectable({ providedIn: 'root' })
export class PolicyService {
  private db = inject(Firestore);
  private auth = inject(Auth);
  private authService = inject(AuthService);

  private async profile(): Promise<AppProfile> {
    const profile = await firstValueFrom(
      this.authService.profile$.pipe(filter((value): value is AppProfile => !!value), take(1))
    );
    return profile;
  }

  private tenantPolicies(orgId: string) {
    return collection(this.db, `organizations/${orgId}/policies`);
  }

  private tenantAssignments(orgId: string) {
    return collection(this.db, `organizations/${orgId}/policyAssignments`);
  }

  private tenantAcknowledgements(orgId: string) {
    return collection(this.db, `organizations/${orgId}/policyAcknowledgements`);
  }

  private normalizePolicy(id: string, data: any): Policy {
    return {
      id,
      orgId: data.orgId ?? null,
      scope: data.scope ?? (data.orgId ? 'organization' : 'platform'),
      sourcePolicyId: data.sourcePolicyId ?? null,
      status: data.status ?? 'active',
      title: data.title ?? '',
      category: data.category ?? '',
      language: data.language ?? 'en',
      area: data.area ?? '',
      version: data.version ?? '',
      effectiveDate: data.effectiveDate ?? '',
      lastRevised: data.lastRevised ?? '',
      lastApproved: data.lastApproved ?? '',
      nextReview: data.nextReview ?? '',
      owner: data.owner ?? '',
      requiresAcknowledgement: !!data.requiresAcknowledgement,
      blocking: !!data.blocking,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
      createdByUid: data.createdByUid,
      contentHtml: data.contentHtml ?? '',
      referencesHtml: data.referencesHtml ?? '',
    } as Policy;
  }

  private applyListOptions(items: Policy[], opts?: ListPolicyOptions): Policy[] {
    let result = opts?.includeArchived
      ? items
      : items.filter(policy => policy.status !== 'archived');

    result = [...result].sort((a, b) => {
      if (opts?.latest) {
        return epochMs(b.createdAt) - epochMs(a.createdAt);
      }
      return `${a.category} ${a.title}`.localeCompare(`${b.category} ${b.title}`);
    });

    return opts?.limit ? result.slice(0, opts.limit) : result;
  }

  async listPolicies(opts?: ListPolicyOptions): Promise<Policy[]> {
    const profile = await this.profile();

    if (profile.role === 'super_admin') {
      return this.applyListOptions(await this.listPlatformPolicies(), opts);
    }

    if (!profile.orgId) return [];

    if (profile.role === 'admin' || profile.role === 'manager') {
      const snap = await getDocs(this.tenantPolicies(profile.orgId));
      return this.applyListOptions(
        snap.docs.map(item => this.normalizePolicy(item.id, item.data())),
        opts
      );
    }

    const assignmentsQuery = query(
      this.tenantAssignments(profile.orgId),
      where('userId', '==', profile.uid),
      where('active', '==', true)
    );
    const assignments = await getDocs(assignmentsQuery);
    const policyIds = assignments.docs.map(item => String(item.data()['policyId'] ?? '')).filter(Boolean);
    const policies = await Promise.all(
      policyIds.map(async policyId => {
        const snap = await getDoc(doc(this.db, `organizations/${profile.orgId}/policies/${policyId}`));
        return snap.exists() ? this.normalizePolicy(snap.id, snap.data()) : null;
      })
    );

    return this.applyListOptions(
      policies.filter((policy): policy is Policy => !!policy),
      opts
    );
  }

  async listPlatformPolicies(): Promise<Policy[]> {
    const [platform, legacy] = await Promise.all([
      getDocs(collection(this.db, 'platformPolicies')),
      getDocs(collection(this.db, 'policies')),
    ]);

    const merged = new Map<string, Policy>();
    legacy.docs.forEach(item => merged.set(item.id, this.normalizePolicy(item.id, {
      ...item.data(),
      scope: 'platform',
      orgId: null,
      sourcePolicyId: item.id,
    })));
    platform.docs.forEach(item => merged.set(item.id, this.normalizePolicy(item.id, item.data())));
    return Array.from(merged.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  async createPolicy(payload: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const profile = await this.profile();
    if (!profile.orgId || !['admin', 'manager'].includes(profile.role)) {
      throw new Error('Organization administrator access required.');
    }

    const ref = doc(this.tenantPolicies(profile.orgId));
    await setDoc(ref, stripUndefined({
      ...payload,
      id: ref.id,
      orgId: profile.orgId,
      scope: 'organization',
      sourcePolicyId: null,
      createdByUid: profile.uid,
      updatedBy: profile.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return ref.id;
  }

  async updatePolicy(policyId: string, patch: Partial<Policy>): Promise<void> {
    const profile = await this.profile();
    if (!profile.orgId || !['admin', 'manager'].includes(profile.role)) {
      throw new Error('Organization administrator access required.');
    }

    await updateDoc(
      doc(this.db, `organizations/${profile.orgId}/policies/${policyId}`),
      stripUndefined({
        ...patch,
        orgId: profile.orgId,
        updatedBy: profile.uid,
        updatedAt: serverTimestamp(),
      })
    );
  }

  async deletePolicy(policyId: string): Promise<void> {
    const profile = await this.profile();
    if (!profile.orgId || !['admin', 'manager'].includes(profile.role)) {
      throw new Error('Organization administrator access required.');
    }
    await deleteDoc(doc(this.db, `organizations/${profile.orgId}/policies/${policyId}`));
  }

  async getPolicy(policyId: string): Promise<Policy | null> {
    const profile = await this.profile();
    if (profile.role === 'super_admin') {
      const platform = await getDoc(doc(this.db, `platformPolicies/${policyId}`));
      if (platform.exists()) return this.normalizePolicy(platform.id, platform.data());
      const legacy = await getDoc(doc(this.db, `policies/${policyId}`));
      return legacy.exists() ? this.normalizePolicy(legacy.id, legacy.data()) : null;
    }
    if (!profile.orgId) return null;
    const snap = await getDoc(doc(this.db, `organizations/${profile.orgId}/policies/${policyId}`));
    return snap.exists() ? this.normalizePolicy(snap.id, snap.data()) : null;
  }

  async assignPlatformPolicyToOrganization(policyId: string, orgId: string): Promise<void> {
    const profile = await this.profile();
    if (profile.role !== 'super_admin') throw new Error('Super admin access required.');

    const platformRef = doc(this.db, `platformPolicies/${policyId}`);
    const legacyRef = doc(this.db, `policies/${policyId}`);
    let source = await getDoc(platformRef);
    if (!source.exists()) source = await getDoc(legacyRef);
    if (!source.exists()) throw new Error('Platform policy not found.');

    const data = source.data();
    const batch = writeBatch(this.db);
    batch.set(platformRef, stripUndefined({
      ...data,
      id: policyId,
      orgId: null,
      scope: 'platform',
      sourcePolicyId: policyId,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    batch.set(doc(this.db, `organizations/${orgId}/policies/${policyId}`), stripUndefined({
      ...data,
      id: policyId,
      orgId,
      scope: 'organization',
      sourcePolicyId: policyId,
      assignedByUid: profile.uid,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }), { merge: true });
    batch.set(doc(this.db, `organizationPolicyAssignments/${orgId}_${policyId}`), {
      orgId,
      policyId,
      assignedByUid: profile.uid,
      assignedAt: serverTimestamp(),
      active: true,
    }, { merge: true });
    await batch.commit();
  }

  async assignPolicyToUsers(policyId: string, userIds: string[]): Promise<void> {
    const profile = await this.profile();
    if (!profile.orgId || !['admin', 'manager'].includes(profile.role)) {
      throw new Error('Organization administrator access required.');
    }

    const batch = writeBatch(this.db);
    for (const userId of userIds) {
      const id = `${policyId}_${userId}`;
      batch.set(doc(this.db, `organizations/${profile.orgId}/policyAssignments/${id}`), {
        id,
        orgId: profile.orgId,
        policyId,
        userId,
        assignedByUid: profile.uid,
        assignedAt: serverTimestamp(),
        active: true,
      } satisfies PolicyAssignment);
    }
    await batch.commit();
  }

  async listAssignmentsForPolicy(policyId: string): Promise<PolicyAssignment[]> {
    const profile = await this.profile();
    if (!profile.orgId) return [];
    const q = query(this.tenantAssignments(profile.orgId), where('policyId', '==', policyId));
    const snap = await getDocs(q);
    return snap.docs.map(item => ({ id: item.id, ...item.data() } as PolicyAssignment));
  }

  async ackExists(policyId: string, uid: string): Promise<boolean> {
    const profile = await this.profile();
    if (!profile.orgId || uid !== profile.uid) return false;
    const id = `${policyId}_${uid}`;
    const snap = await getDoc(doc(this.db, `organizations/${profile.orgId}/policyAcknowledgements/${id}`));
    return snap.exists();
  }

  async acknowledge(opts: { policyId: string; policyVersion: string; userId: string }): Promise<void> {
    const profile = await this.profile();
    if (!profile.orgId || opts.userId !== profile.uid) throw new Error('Invalid acknowledgement user.');
    const id = `${opts.policyId}_${opts.userId}`;
    await setDoc(doc(this.db, `organizations/${profile.orgId}/policyAcknowledgements/${id}`), {
      id,
      orgId: profile.orgId,
      policyId: opts.policyId,
      policyVersion: opts.policyVersion,
      userId: opts.userId,
      acknowledgedAt: serverTimestamp(),
    } satisfies PolicyAcknowledgement, { merge: false });
  }

  async listAcknowledgementsForPolicy(policyId: string): Promise<PolicyAcknowledgement[]> {
    const profile = await this.profile();
    if (!profile.orgId || !['admin', 'manager'].includes(profile.role)) return [];
    const q = query(
      this.tenantAcknowledgements(profile.orgId),
      where('policyId', '==', policyId),
      limit(500)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as PolicyAcknowledgement))
      .sort((a, b) => epochMs(b.acknowledgedAt) - epochMs(a.acknowledgedAt));
  }
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function epochMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
