import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { CommunicationCenterRepository } from './communication-center.repository';
import {
  CreateNewsletterDraftPayload,
  NewsletterDoc,
  NewsletterStatus,
  UpdateNewsletterDraftPayload,
  CommunicationRepositoryState,
} from '../contracts/communication.models';
import { Observable } from 'rxjs';

const WRITEABLE_NEWSLETTER_STATUSES: NewsletterStatus[] = ['draft', 'approval_pending', 'approved', 'archived'];

@Injectable({ providedIn: 'root' })
export class NewsletterRepository extends CommunicationCenterRepository {
  listNewsletters(orgId: string | null): Observable<CommunicationRepositoryState<NewsletterDoc>> {
    return this.listOrgScoped<NewsletterDoc>('newsletters', orgId, orderBy('updatedAt', 'desc'));
  }

  async createNewsletterDraft(orgId: string, payload: CreateNewsletterDraftPayload): Promise<string> {
    return this.createWithAudit<NewsletterDoc>({
      collectionName: 'newsletters',
      entityType: 'newsletter',
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
        subject: payload.subject.trim(),
        previewText: payload.previewText.trim(),
        html: payload.html.trim(),
        templateId: payload.templateId ?? null,
        audienceSegmentIds: payload.audienceSegmentIds ?? [],
        mergeFields: payload.mergeFields ?? [],
        personalizationTokens: payload.personalizationTokens ?? [],
        scheduledAt: null,
        scheduledFor: null,
        approvedAt: null,
        approvedByUid: null,
      }),
    });
  }

  async updateNewsletterDraft(orgId: string, newsletterId: string, patch: UpdateNewsletterDraftPayload): Promise<void> {
    return this.updateWithAudit<NewsletterDoc>({
      collectionName: 'newsletters',
      entityType: 'newsletter',
      orgId,
      docId: newsletterId,
      patch: {
        ...patch,
        title: patch.title?.trim(),
        summary: patch.summary?.trim(),
        subject: patch.subject?.trim(),
        previewText: patch.previewText?.trim(),
        html: patch.html?.trim(),
      },
      validateCurrent: (current) => {
        if (current.status === 'sent') {
          throw new Error('invalid-status');
        }
      },
      validateNext: (next) => {
        if (!WRITEABLE_NEWSLETTER_STATUSES.includes(next.status)) {
          throw new Error('invalid-status');
        }
        if (next.status === 'approved' && next.approvedByUid == null) {
          next.approvedByUid = next.updatedByUid;
          next.approvedAt = next.updatedAt;
        }
        if (next.status !== 'approved') {
          next.scheduledAt = null;
          next.scheduledFor = null;
        }
      },
    });
  }
}