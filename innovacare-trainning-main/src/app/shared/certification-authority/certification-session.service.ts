import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { firstValueFrom, map, of, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth';
import { CertificationAuditService } from './certification-audit.service';
import { CertificationSession } from './certification.models';
import { cleanObject, requireOrgId } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CertificationSessionService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  listForCurrentOrganization() {
    return this.auth.profile$.pipe(
      switchMap((profile) => {
        if (!profile?.orgId) return of([] as CertificationSession[]);
        const q = query(
          collection(this.db, 'certificationSessions'),
          where('organizationId', '==', profile.orgId)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map((items) =>
            (items as CertificationSession[]).sort((a, b) =>
              this.epochMs(b.updatedAt || b.createdAt) - this.epochMs(a.updatedAt || a.createdAt)
            )
          )
        );
      })
    );
  }

  listOpenSessionsForLearners() {
    const q = query(
      collection(this.db, 'certificationSessions'),
      where('status', '==', 'applications_open')
    );
    return collectionData(q, { idField: 'id' }).pipe(
      map((items) =>
        (items as CertificationSession[]).sort((a, b) =>
          String(a.applicationEndDate || '').localeCompare(String(b.applicationEndDate || ''))
        )
      )
    );
  }

  async getSession(id: string): Promise<CertificationSession | null> {
    const snap = await getDoc(doc(this.db, `certificationSessions/${id}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as CertificationSession) : null;
  }

  async save(input: Partial<CertificationSession>, id?: string): Promise<string> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);
    const name = String(input.name || '').trim();
    const certificationId = String(input.certificationId || '').trim();
    if (!certificationId) throw new Error('Select a certification before creating a session.');
    if (!name) throw new Error('Session name is required.');

    const payload: CertificationSession = cleanObject({
      certificationId,
      organizationId,
      name,
      description: String(input.description || '').trim(),
      applicationStartDate: input.applicationStartDate || null,
      applicationEndDate: input.applicationEndDate || null,
      examStartDate: input.examStartDate || null,
      examEndDate: input.examEndDate || null,
      status: input.status || 'draft',
      examMode: input.examMode || 'online',
      maxCandidates: input.maxCandidates ?? null,
      centers: input.centers || [],
      linkedCourseIds: input.linkedCourseIds || [],
      linkedExamIds: input.linkedExamIds || [],
      createdBy: input.createdBy ?? this.auth.currentUid ?? null,
      updatedAt: serverTimestamp(),
    } as CertificationSession);

    if (id) {
      await updateDoc(doc(this.db, `certificationSessions/${id}`), payload as any);
      await this.audit.write({
        organizationId,
        action: 'certification.session.update',
        targetType: 'certificationSession',
        targetId: id,
        message: `Updated certification session ${name}`,
      });
      return id;
    }

    const ref = await addDoc(
      collection(this.db, 'certificationSessions'),
      cleanObject({ ...payload, createdAt: serverTimestamp() })
    );
    await this.audit.write({
      organizationId,
      action: 'certification.session.create',
      targetType: 'certificationSession',
      targetId: ref.id,
      message: `Created certification session ${name}`,
    });
    return ref.id;
  }

  async updateStatus(id: string, status: CertificationSession['status']): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);
    await updateDoc(doc(this.db, `certificationSessions/${id}`), {
      status,
      updatedAt: serverTimestamp(),
    } as any);
    await this.audit.write({
      organizationId,
      action: 'certification.session.update',
      targetType: 'certificationSession',
      targetId: id,
      meta: { status },
    });
  }

  private epochMs(value: any): number {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
