import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CommunicationCenterRepository } from './communication-center.repository';
import {
  CommunicationRepositoryState,
  CommunicationSegmentDoc,
  CreateSegmentDraftPayload,
} from '../contracts/communication.models';

@Injectable({ providedIn: 'root' })
export class SegmentRepository extends CommunicationCenterRepository {
  listSegments(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationSegmentDoc>> {
    return this.listOrgScoped<CommunicationSegmentDoc>('communication_segments', orgId, orderBy('updatedAt', 'desc'));
  }

  async createSegmentDraft(orgId: string, payload: CreateSegmentDraftPayload): Promise<string> {
    return this.createWithAudit<CommunicationSegmentDoc>({
      collectionName: 'communication_segments',
      entityType: 'segment',
      orgId,
      build: (docId, actor, now) => ({
        id: docId,
        orgId,
        title: payload.title.trim(),
        summary: payload.summary.trim(),
        tags: payload.tags ?? [],
        ...this.buildBaseFields(actor, now),
        status: 'draft',
        family: payload.family,
        description: payload.description.trim(),
        estimatedAudienceSize: payload.estimatedAudienceSize ?? 0,
        filterMode: 'dynamic_mock',
        filters: payload.filters ?? [],
        sourceCollections: payload.sourceCollections ?? [],
      }),
    });
  }
}