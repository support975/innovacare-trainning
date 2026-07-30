import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  QueryConstraint,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { AuthService, AppProfile } from '../../../../core/auth';
import {
  COMMUNICATION_DRAFT_SAFETY,
  CommunicationActorContext,
  CommunicationActorRole,
  CommunicationAuditDoc,
  CommunicationBaseDoc,
  CommunicationEntityType,
  CommunicationRepositoryState,
} from '../contracts/communication.models';
import { Observable, firstValueFrom, of } from 'rxjs';
import { catchError, filter, map, startWith, take } from 'rxjs/operators';

type RepoErrorCode = CommunicationRepositoryState<unknown>['error'];

@Injectable()
export abstract class CommunicationCenterRepository {
  protected readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  protected readonly draftSafety = COMMUNICATION_DRAFT_SAFETY;

  protected listOrgScoped<T extends { id: string }>(
    collectionName: string,
    orgId: string | null,
    ...constraints: QueryConstraint[]
  ): Observable<CommunicationRepositoryState<T>> {
    if (!orgId?.trim()) {
      return of({ items: [], loading: false, error: null });
    }

    const ref = query(
      collection(this.firestore, collectionName),
      where('orgId', '==', orgId),
      ...constraints,
    );

    return collectionData(ref, { idField: 'id' }).pipe(
      map((items) => ({ items: items as T[], loading: false, error: null as RepoErrorCode })),
      startWith({ items: [] as T[], loading: true, error: null as RepoErrorCode }),
      catchError((error: unknown) => of({
        items: [] as T[],
        loading: false,
        error: this.mapErrorCode(error),
      })),
    );
  }

  protected async createWithAudit<T extends CommunicationBaseDoc>(input: {
    collectionName: string;
    entityType: CommunicationEntityType;
    orgId: string;
    build: (docId: string, actor: CommunicationActorContext, now: string) => T;
  }): Promise<string> {
    const actor = await this.requireActor(input.orgId);
    const now = new Date().toISOString();
    const docRef = doc(collection(this.firestore, input.collectionName));
    const auditRef = doc(collection(this.firestore, 'communication_audits'));
    const data = input.build(docRef.id, actor, now);

    const batch = writeBatch(this.firestore);
    batch.set(docRef, data as Record<string, unknown>);
    batch.set(auditRef, this.buildAuditEntry({
      auditId: auditRef.id,
      orgId: input.orgId,
      actor,
      now,
      entityType: input.entityType,
      entityCollection: input.collectionName,
      entityId: docRef.id,
      title: `${input.entityType} draft created`,
      summary: `${input.entityType} draft created in Communication Center.`,
      actionType: 'draft_created',
      beforeState: null,
      afterState: this.toAuditState(data),
    }));
    await batch.commit();
    return docRef.id;
  }

  protected async updateWithAudit<T extends CommunicationBaseDoc>(input: {
    collectionName: string;
    entityType: CommunicationEntityType;
    orgId: string;
    docId: string;
    patch: Partial<T>;
    validateCurrent?: (current: T) => void;
    validateNext?: (next: T) => void;
  }): Promise<void> {
    const actor = await this.requireActor(input.orgId);
    const ref = doc(this.firestore, input.collectionName, input.docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('not-found');
    }

    const current = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as T;
    if (current.orgId !== input.orgId) {
      throw new Error('permission-denied');
    }

    input.validateCurrent?.(current);
    const now = new Date().toISOString();
    const next = {
      ...current,
      ...input.patch,
      updatedAt: now,
      updatedByUid: actor.actorUid,
      updatedBy: actor.actorId,
    } as T;
    input.validateNext?.(next);

    const auditRef = doc(collection(this.firestore, 'communication_audits'));
    const batch = writeBatch(this.firestore);
    batch.update(ref, {
      ...(input.patch as Record<string, unknown>),
      updatedAt: now,
      updatedByUid: actor.actorUid,
      updatedBy: actor.actorId,
    });
    batch.set(auditRef, this.buildAuditEntry({
      auditId: auditRef.id,
      orgId: input.orgId,
      actor,
      now,
      entityType: input.entityType,
      entityCollection: input.collectionName,
      entityId: input.docId,
      title: `${input.entityType} draft updated`,
      summary: `${input.entityType} draft updated in Communication Center.`,
      actionType: 'draft_updated',
      beforeState: this.toAuditState(current),
      afterState: this.toAuditState(next),
    }));
    await batch.commit();
  }

  protected buildBaseFields(actor: CommunicationActorContext, now: string) {
    return {
      safety: this.draftSafety,
      createdAt: now,
      updatedAt: now,
      createdByUid: actor.actorUid,
      updatedByUid: actor.actorUid,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    };
  }

  private async requireActor(orgId: string): Promise<CommunicationActorContext> {
    if (!orgId?.trim()) {
      throw new Error('orgId-required');
    }

    const profile = await firstValueFrom(
      this.auth.profile$.pipe(
        filter((profileValue) => !!profileValue?.uid),
        take(1),
      ),
    );

    if (!profile?.uid) {
      throw new Error('permission-denied');
    }

    const isSuperAdmin = profile.role === 'super_admin';
    const activeOrgId = profile.orgId ?? null;
    if (!isSuperAdmin && activeOrgId !== orgId) {
      throw new Error('permission-denied');
    }
    if (!isSuperAdmin && profile.role !== 'admin' && profile.role !== 'manager') {
      throw new Error('permission-denied');
    }

    return {
      actorId: profile.uid,
      actorUid: profile.uid,
      actorRole: this.mapActorRole(profile),
      orgId,
    };
  }

  private mapActorRole(profile: AppProfile): CommunicationActorRole {
    if (profile.role === 'super_admin') return 'super_admin';
    if (profile.role === 'admin') return 'org_admin';
    if (profile.role === 'manager') return 'manager';
    return 'staff';
  }

  private buildAuditEntry(input: {
    auditId: string;
    orgId: string;
    actor: CommunicationActorContext;
    now: string;
    entityType: CommunicationEntityType;
    entityCollection: string;
    entityId: string;
    title: string;
    summary: string;
    actionType: CommunicationAuditDoc['actionType'];
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }): CommunicationAuditDoc {
    return {
      id: input.auditId,
      orgId: input.orgId,
      title: input.title,
      summary: input.summary,
      tags: ['communication-center', 'draft-only', input.entityType],
      safety: this.draftSafety,
      createdAt: input.now,
      updatedAt: input.now,
      createdByUid: input.actor.actorUid,
      updatedByUid: input.actor.actorUid,
      createdBy: input.actor.actorId,
      updatedBy: input.actor.actorId,
      entityType: input.entityType,
      entityCollection: input.entityCollection,
      entityId: input.entityId,
      actionType: input.actionType,
      action: input.actionType,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
      actorUid: input.actor.actorUid,
      beforeState: input.beforeState,
      afterState: input.afterState,
      promptVersion: null,
      modelVersion: null,
      rollbackReference: null,
    };
  }

  private toAuditState(value: CommunicationBaseDoc | null): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    return { ...value };
  }

  private mapErrorCode(error: unknown): RepoErrorCode {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : '';
    if (code.includes('permission-denied')) return 'permission-denied';
    if (code.includes('unavailable')) return 'unavailable';
    return 'unknown';
  }
}
