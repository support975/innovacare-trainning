import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CommunicationCenterRepository } from './communication-center.repository';
import {
  CampaignStatus,
  CommunicationRepositoryState,
  CreateCampaignDraftPayload,
  NewsletterCampaignDoc,
} from '../contracts/communication.models';

const WRITEABLE_CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'approval_pending', 'approved'];

@Injectable({ providedIn: 'root' })
export class CampaignRepository extends CommunicationCenterRepository {
  listCampaignDrafts(orgId: string | null): Observable<CommunicationRepositoryState<NewsletterCampaignDoc>> {
    return this.listOrgScoped<NewsletterCampaignDoc>('newsletter_campaigns', orgId, orderBy('createdAt', 'desc'));
  }

  async createCampaignDraft(orgId: string, payload: CreateCampaignDraftPayload): Promise<string> {
    return this.createWithAudit<NewsletterCampaignDoc>({
      collectionName: 'newsletter_campaigns',
      entityType: 'campaign',
      orgId,
      build: (docId, actor, now) => ({
        id: docId,
        orgId,
        title: payload.title.trim(),
        summary: payload.summary.trim(),
        tags: payload.tags ?? [],
        ...this.buildBaseFields(actor, now),
        status: 'draft',
        createdByRole: actor.actorRole,
        newsletterId: payload.newsletterId,
        audienceSegmentIds: payload.audienceSegmentIds ?? [],
        estimatedRecipients: payload.estimatedRecipients ?? 0,
        scheduledAt: null,
        scheduledFor: null,
        launchedAt: null,
        completedAt: null,
        conversionGoal: payload.conversionGoal ?? 'engagement',
      }),
    });
  }

  assertDraftOnlyCampaign(next: NewsletterCampaignDoc): void {
    if (!WRITEABLE_CAMPAIGN_STATUSES.includes(next.status)) {
      throw new Error('invalid-status');
    }
    if (next.status !== 'approved') {
      next.scheduledAt = null;
      next.scheduledFor = null;
    }
    if (next.status !== 'approved' && (next.scheduledAt || next.scheduledFor)) {
      throw new Error('approval-required');
    }
  }
}