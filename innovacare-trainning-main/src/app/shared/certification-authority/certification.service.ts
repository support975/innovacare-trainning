import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where,
} from '@angular/fire/firestore';
import { firstValueFrom, map, of, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth';
import { Certification } from './certification.models';
import { CertificationAuditService } from './certification-audit.service';
import { cleanObject, requireOrgId } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CertificationService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  listForCurrentOrganization() {
    return this.auth.profile$.pipe(
      switchMap((profile) => {
        if (!profile?.orgId) return of([] as Certification[]);
        const q = query(
          collection(this.db, 'officialCertifications'),
          where('organizationId', '==', profile.orgId)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map((items) =>
            (items as Certification[]).sort((a, b) =>
              this.epochMs(b.updatedAt || b.createdAt) - this.epochMs(a.updatedAt || a.createdAt)
            )
          )
        );
      })
    );
  }

  async getCertification(id: string): Promise<Certification | null> {
    const snap = await getDoc(doc(this.db, `officialCertifications/${id}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Certification) : null;
  }

  async save(input: Partial<Certification>, id?: string): Promise<string> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Certification name is required.');

    const payload: Certification = cleanObject({
      organizationId,
      name,
      description: String(input.description || '').trim(),
      type: input.type || 'professional',
      status: input.status || 'draft',
      linkedProgramIds: input.linkedProgramIds || [],
      linkedCourseIds: input.linkedCourseIds || [],
      linkedExamIds: input.linkedExamIds || [],
      eligibilityRules: input.eligibilityRules || {},
      passingRules: input.passingRules || {},
      certificateTemplateId: input.certificateTemplateId ?? null,
      createdBy: input.createdBy ?? this.auth.currentUid ?? null,
      updatedAt: serverTimestamp(),
    } as Certification);

    if (id) {
      await updateDoc(doc(this.db, `officialCertifications/${id}`), payload as any);
      await this.audit.write({
        organizationId,
        action: 'certification.update',
        targetType: 'officialCertification',
        targetId: id,
        message: `Updated certification ${name}`,
      });
      return id;
    }

    const ref = await addDoc(
      collection(this.db, 'officialCertifications'),
      cleanObject({ ...payload, createdAt: serverTimestamp() })
    );
    await this.audit.write({
      organizationId,
      action: 'certification.create',
      targetType: 'officialCertification',
      targetId: ref.id,
      message: `Created certification ${name}`,
    });
    return ref.id;
  }

  async archive(id: string): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);
    await setDoc(
      doc(this.db, `officialCertifications/${id}`),
      { status: 'archived', updatedAt: serverTimestamp() },
      { merge: true }
    );
    await this.audit.write({
      organizationId,
      action: 'certification.archive',
      targetType: 'officialCertification',
      targetId: id,
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
