import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, startWith } from 'rxjs/operators';
import {
  CommunicationDashboardSnapshot,
  CommunicationDocumentState,
  CommunicationRepositoryState,
  CommunicationApprovalDoc,
  CommunicationAuditDoc,
  CommunicationSegmentDoc,
  CommunicationTemplateDoc,
  CreateCampaignDraftPayload,
  CreateNewsletterDraftPayload,
  CreateSegmentDraftPayload,
  CreateTemplateDraftPayload,
  NewsletterAnalyticsDoc,
  NewsletterCampaignDoc,
  NewsletterDoc,
  UpdateNewsletterDraftPayload,
} from '../contracts/communication.models';
import { NewsletterRepository } from './newsletter.repository';
import { CampaignRepository } from './campaign.repository';
import { SegmentRepository } from './segment.repository';
import { TemplateRepository } from './template.repository';
import { CommunicationApprovalRepository } from './communication-approval.repository';
import { CommunicationAuditRepository } from './communication-audit.repository';

function toErrorCode(error: unknown): CommunicationRepositoryState<never>['error'] {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';
  if (code.includes('permission-denied')) return 'permission-denied';
  if (code.includes('unavailable')) return 'unavailable';
  return 'unknown';
}

@Injectable({ providedIn: 'root' })
export class CommunicationCenterService {
  private readonly firestore = inject(Firestore);
  private readonly newsletters = inject(NewsletterRepository);
  private readonly campaigns = inject(CampaignRepository);
  private readonly segments = inject(SegmentRepository);
  private readonly templates = inject(TemplateRepository);
  private readonly approvals = inject(CommunicationApprovalRepository);
  private readonly audits = inject(CommunicationAuditRepository);

  listNewsletters(orgId: string | null): Observable<CommunicationRepositoryState<NewsletterDoc>> {
    return orgId ? this.newsletters.listNewsletters(orgId) : of({ items: [], loading: false, error: null });
  }

  createNewsletterDraft(orgId: string, payload: CreateNewsletterDraftPayload): Promise<string> {
    return this.newsletters.createNewsletterDraft(orgId, payload);
  }

  updateNewsletterDraft(orgId: string, newsletterId: string, patch: UpdateNewsletterDraftPayload): Promise<void> {
    return this.newsletters.updateNewsletterDraft(orgId, newsletterId, patch);
  }

  listCampaignDrafts(orgId: string | null): Observable<CommunicationRepositoryState<NewsletterCampaignDoc>> {
    return orgId ? this.campaigns.listCampaignDrafts(orgId) : of({ items: [], loading: false, error: null });
  }

  createCampaignDraft(orgId: string, payload: CreateCampaignDraftPayload): Promise<string> {
    return this.campaigns.createCampaignDraft(orgId, payload);
  }

  listSegments(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationSegmentDoc>> {
    return orgId ? this.segments.listSegments(orgId) : of({ items: [], loading: false, error: null });
  }

  createSegmentDraft(orgId: string, payload: CreateSegmentDraftPayload): Promise<string> {
    return this.segments.createSegmentDraft(orgId, payload);
  }

  listTemplates(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationTemplateDoc>> {
    return orgId ? this.templates.listTemplates(orgId) : of({ items: [], loading: false, error: null });
  }

  createTemplateDraft(orgId: string, payload: CreateTemplateDraftPayload): Promise<string> {
    return this.templates.createTemplateDraft(orgId, payload);
  }

  listApprovals(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationApprovalDoc>> {
    return orgId ? this.approvals.listApprovals(orgId) : of({ items: [], loading: false, error: null });
  }

  listAudits(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationAuditDoc>> {
    return orgId ? this.audits.listAudits(orgId) : of({ items: [], loading: false, error: null });
  }

  listAnalytics(orgId: string | null): Observable<CommunicationRepositoryState<NewsletterAnalyticsDoc>> {
    if (!orgId) {
      return of({ items: [], loading: false, error: null });
    }

    const ref = query(
      collection(this.firestore, 'newsletter_analytics'),
      where('orgId', '==', orgId),
      orderBy('updatedAt', 'desc'),
    );

    return collectionData(ref, { idField: 'id' }).pipe(
      map((items) => ({
        items: items as NewsletterAnalyticsDoc[],
        loading: false,
        error: null as CommunicationRepositoryState<never>['error'],
      })),
      startWith({
        items: [] as NewsletterAnalyticsDoc[],
        loading: true,
        error: null as CommunicationRepositoryState<never>['error'],
      }),
      catchError((error: unknown) => of({
        items: [] as NewsletterAnalyticsDoc[],
        loading: false,
        error: toErrorCode(error),
      })),
    );
  }

  getDashboardSnapshot(orgId: string | null): Observable<CommunicationDocumentState<CommunicationDashboardSnapshot>> {
    if (!orgId) {
      return of({ item: null, loading: false, error: null });
    }

    return combineLatest([
      this.listNewsletters(orgId),
      this.listCampaignDrafts(orgId),
      this.listApprovals(orgId),
      this.listAnalytics(orgId),
    ]).pipe(
      map(([newsletterState, campaignState, approvalState, analyticsState]) => {
        const loading = newsletterState.loading || campaignState.loading || approvalState.loading || analyticsState.loading;
        const error = newsletterState.error || campaignState.error || approvalState.error || analyticsState.error;
        const newsletters = newsletterState.items;
        const campaigns = campaignState.items;
        const approvals = approvalState.items;
        const analytics = analyticsState.items;

        const sends = analytics.reduce((sum, item) => sum + item.sends, 0);
        const opens = analytics.reduce((sum, item) => sum + item.opens, 0);
        const clicks = analytics.reduce((sum, item) => sum + item.clicks, 0);
        const unsubscribes = analytics.reduce((sum, item) => sum + item.unsubscribes, 0);
        const revenueAttributed = analytics.reduce((sum, item) => sum + item.revenueAttributed, 0);
        const openRate = sends > 0 ? Math.round((opens / sends) * 100) : 0;
        const clickRate = sends > 0 ? Math.round((clicks / sends) * 100) : 0;

        return {
          item: {
            orgId,
            communicationHealthScore: Math.max(42, Math.min(96, 55 + openRate - unsubscribes * 3)),
            engagementScore: Math.max(30, Math.min(95, 40 + clickRate + newsletters.length * 4)),
            draftNewsletters: newsletters.filter((item) => item.status === 'draft').length,
            scheduledCampaigns: campaigns.filter((item) => item.status === 'scheduled' || item.status === 'running').length,
            pendingApprovals: approvals.filter((item) => item.status === 'pending').length,
            analytics: {
              sends,
              opens,
              clicks,
              unsubscribes,
              revenueAttributed,
            },
          },
          loading,
          error,
        };
      }),
      startWith({ item: null, loading: true, error: null as CommunicationRepositoryState<never>['error'] }),
      catchError((error: unknown) => of({ item: null, loading: false, error: toErrorCode(error) })),
    );
  }
}
