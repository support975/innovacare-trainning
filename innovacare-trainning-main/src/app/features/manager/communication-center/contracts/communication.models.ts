export type CommunicationSafetyMode = 'draft_only';

export type CommunicationProviderName = 'none' | 'sendgrid' | 'mailgun' | 'ses';

export type CommunicationDraftStatus = 'draft' | 'approval_pending' | 'approved' | 'archived';

export type CommunicationAudienceFamily =
  | 'learners'
  | 'organizations'
  | 'courses'
  | 'certifications'
  | 'ai_segments';

export type NewsletterStatus = 'draft' | 'approval_pending' | 'approved' | 'sent' | 'archived';

export type CampaignStatus = 'draft' | 'approval_pending' | 'approved' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type CommunicationApprovalPriority = 'low' | 'normal' | 'high' | 'critical';

export type CommunicationEntityType =
  | 'newsletter'
  | 'campaign'
  | 'segment'
  | 'template'
  | 'approval'
  | 'audit';

export type CommunicationActorRole =
  | 'super_admin'
  | 'org_admin'
  | 'program_admin'
  | 'manager'
  | 'staff'
  | 'system';

export type EventType = 'open' | 'click' | 'unsubscribe' | 'bounce' | 'preview';

export type TemplateCategory =
  | 'weekly_digest'
  | 'organization_report'
  | 'course_announcement'
  | 'certification_notice'
  | 'study_reminder'
  | 'reactivation';

export interface CommunicationSafety {
  mode: CommunicationSafetyMode;
  mockOnly: true;
  approvalRequired: boolean;
  provider: CommunicationProviderName;
  canAutoSend: false;
}

export interface CommunicationAuditStamp {
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  updatedByUid: string;
  createdBy: string;
  updatedBy: string;
}

export interface CommunicationActorContext {
  actorId: string;
  actorUid: string;
  actorRole: CommunicationActorRole;
  orgId: string;
}

export interface CommunicationBaseDoc extends CommunicationAuditStamp {
  id: string;
  orgId: string;
  title: string;
  summary: string;
  tags: string[];
  safety: CommunicationSafety;
}

export interface AudienceFilterDefinition {
  field: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: string | number | boolean | string[];
}

export interface CommunicationSegmentDoc extends CommunicationBaseDoc {
  status: CommunicationDraftStatus;
  family: CommunicationAudienceFamily;
  description: string;
  estimatedAudienceSize: number;
  filterMode: 'static_mock' | 'dynamic_mock';
  filters: AudienceFilterDefinition[];
  sourceCollections: string[];
}

export interface CommunicationTemplateDoc extends CommunicationBaseDoc {
  type: TemplateCategory;
  status: CommunicationDraftStatus;
  category: TemplateCategory;
  subjectTemplate: string;
  previewTextTemplate: string;
  htmlTemplate: string;
  personalizationTokens: string[];
  aiAssistEnabled: boolean;
}

export interface NewsletterDoc extends CommunicationBaseDoc {
  status: NewsletterStatus;
  createdByRole: CommunicationActorRole;
  subject: string;
  previewText: string;
  html: string;
  templateId: string | null;
  audienceSegmentIds: string[];
  mergeFields: string[];
  personalizationTokens: string[];
  scheduledAt: string | null;
  scheduledFor: string | null;
  approvedAt: string | null;
  approvedByUid: string | null;
}

export interface NewsletterCampaignDoc extends CommunicationBaseDoc {
  status: CampaignStatus;
  createdByRole: CommunicationActorRole;
  newsletterId: string;
  audienceSegmentIds: string[];
  estimatedRecipients: number;
  scheduledAt: string | null;
  scheduledFor: string | null;
  launchedAt: string | null;
  completedAt: string | null;
  conversionGoal: 'engagement' | 'completion' | 'retention' | 'revenue' | 'awareness';
}

export interface NewsletterRecipientDoc extends CommunicationAuditStamp {
  id: string;
  orgId: string;
  campaignId: string;
  newsletterId: string;
  recipientUid: string;
  recipientRole: 'learner' | 'guest' | 'organization_admin' | 'executive';
  personalizationPayload: Record<string, string | number | null>;
  status: 'draft' | 'queued_preview' | 'previewed';
  mockDeliveryStatus: 'draft' | 'queued_preview' | 'previewed';
  safety: CommunicationSafety;
}

export interface NewsletterEventDoc extends CommunicationAuditStamp {
  id: string;
  orgId: string;
  campaignId: string;
  newsletterId: string;
  recipientId: string;
  eventType: EventType;
  source: 'emulator_preview' | 'manual_preview' | 'seed';
  metadata: Record<string, string | number | boolean | null>;
  safety: CommunicationSafety;
}

export interface NewsletterAnalyticsDoc extends CommunicationAuditStamp {
  id: string;
  orgId: string;
  campaignId: string;
  newsletterId: string;
  sends: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  conversions: number;
  revenueAttributed: number;
  safety: CommunicationSafety;
}

export interface CommunicationAutomationDoc extends CommunicationBaseDoc {
  triggerType: 'learner_inactivity' | 'course_completion' | 'exam_readiness';
  triggerThreshold: string;
  targetSegmentId: string | null;
  draftTemplateId: string | null;
  actionMode: 'queue_approval_only';
}

export interface CommunicationApprovalDoc extends CommunicationBaseDoc {
  entityType: CommunicationEntityType;
  relatedCollection:
    | 'newsletters'
    | 'newsletter_campaigns'
    | 'communication_templates'
    | 'communication_automations';
  relatedDocumentId: string;
  status: ApprovalStatus;
  priority: CommunicationApprovalPriority;
  requestedByUid: string;
  reviewedByUid: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface CommunicationApprovalListItem extends CommunicationApprovalDoc {
  entityId: string;
}

export interface CommunicationAuditDoc extends CommunicationBaseDoc {
  entityType: CommunicationEntityType;
  entityCollection: string;
  entityId: string;
  actionType:
    | 'draft_created'
    | 'draft_updated'
    | 'approval_requested'
    | 'approval_decision'
    | 'preview_generated';
  action:
    | 'draft_created'
    | 'draft_updated'
    | 'approval_requested'
    | 'approval_decision'
    | 'preview_generated';
  actorId: string;
  actorRole: CommunicationActorRole;
  actorUid: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  promptVersion: string | null;
  modelVersion: string | null;
  rollbackReference: string | null;
}

export interface CommunicationRepositoryState<T> {
  items: T[];
  loading: boolean;
  error: 'permission-denied' | 'unavailable' | 'unknown' | null;
}

export interface CommunicationDocumentState<T> {
  item: T | null;
  loading: boolean;
  error: 'permission-denied' | 'unavailable' | 'unknown' | null;
}

export interface CommunicationOperationResult {
  id: string;
}

export interface CommunicationDashboardData {
  newsletters: NewsletterDoc[];
  campaigns: NewsletterCampaignDoc[];
  approvals: CommunicationApprovalDoc[];
  analytics: NewsletterAnalyticsDoc[];
}

export interface CreateNewsletterDraftPayload {
  title: string;
  summary: string;
  subject: string;
  previewText: string;
  html: string;
  templateId?: string | null;
  audienceSegmentIds?: string[];
  mergeFields?: string[];
  personalizationTokens?: string[];
  tags?: string[];
}

export interface UpdateNewsletterDraftPayload extends Partial<CreateNewsletterDraftPayload> {
  status?: Extract<NewsletterStatus, 'draft' | 'approval_pending' | 'approved' | 'archived'>;
}

export interface CreateCampaignDraftPayload {
  title: string;
  summary: string;
  newsletterId: string;
  audienceSegmentIds?: string[];
  estimatedRecipients?: number;
  conversionGoal?: NewsletterCampaignDoc['conversionGoal'];
  tags?: string[];
}

export interface CreateSegmentDraftPayload {
  title: string;
  summary: string;
  description: string;
  family: CommunicationAudienceFamily;
  filters?: AudienceFilterDefinition[];
  sourceCollections?: string[];
  estimatedAudienceSize?: number;
  tags?: string[];
}

export interface CreateTemplateDraftPayload {
  title: string;
  summary: string;
  type: TemplateCategory;
  subjectTemplate: string;
  previewTextTemplate: string;
  htmlTemplate: string;
  personalizationTokens?: string[];
  aiAssistEnabled?: boolean;
  tags?: string[];
}

export interface CommunicationDashboardSnapshot {
  orgId: string | null;
  communicationHealthScore: number;
  engagementScore: number;
  draftNewsletters: number;
  scheduledCampaigns: number;
  pendingApprovals: number;
  analytics: {
    sends: number;
    opens: number;
    clicks: number;
    unsubscribes: number;
    revenueAttributed: number;
  };
}

export interface EmailProviderContract {
  provider: Exclude<CommunicationProviderName, 'none'>;
  queueBatch(input: {
    orgId: string;
    campaignId: string;
    newsletterId: string;
    recipientIds: string[];
  }): Promise<{ queued: number }>;
  retryFailedBatch(input: { orgId: string; campaignId: string }): Promise<{ retried: number }>;
  processBounce(input: { orgId: string; recipientId: string; reason: string }): Promise<void>;
}

export interface FirestoreCollectionSchemaDraft {
  collection: string;
  docType: string;
  description: string;
  requiredFields: string[];
  orgScoped: true;
  draftOnly: true;
}

export const COMMUNICATION_COLLECTION_SCHEMAS: Record<string, FirestoreCollectionSchemaDraft> = {
  communication_templates: {
    collection: 'communication_templates',
    docType: 'CommunicationTemplateDoc',
    description: 'Reusable communication templates with merge fields and AI assist metadata.',
    requiredFields: ['orgId', 'title', 'type', 'status', 'subjectTemplate', 'htmlTemplate', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  newsletters: {
    collection: 'newsletters',
    docType: 'NewsletterDoc',
    description: 'Draft and approved newsletter documents.',
    requiredFields: ['orgId', 'title', 'status', 'subject', 'html', 'audienceSegmentIds', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  newsletter_campaigns: {
    collection: 'newsletter_campaigns',
    docType: 'NewsletterCampaignDoc',
    description: 'Campaign execution plans associated with newsletters.',
    requiredFields: ['orgId', 'title', 'newsletterId', 'status', 'estimatedRecipients', 'scheduledAt', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  newsletter_recipients: {
    collection: 'newsletter_recipients',
    docType: 'NewsletterRecipientDoc',
    description: 'Draft recipient projections and personalization previews.',
    requiredFields: ['orgId', 'campaignId', 'newsletterId', 'recipientUid', 'status', 'mockDeliveryStatus', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  newsletter_events: {
    collection: 'newsletter_events',
    docType: 'NewsletterEventDoc',
    description: 'Mock preview open/click/unsubscribe events.',
    requiredFields: ['orgId', 'campaignId', 'newsletterId', 'recipientId', 'eventType', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  newsletter_analytics: {
    collection: 'newsletter_analytics',
    docType: 'NewsletterAnalyticsDoc',
    description: 'Aggregated preview analytics for newsletters and campaigns.',
    requiredFields: ['orgId', 'campaignId', 'newsletterId', 'sends', 'opens', 'clicks', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  communication_segments: {
    collection: 'communication_segments',
    docType: 'CommunicationSegmentDoc',
    description: 'Saved audience definitions and AI segment placeholders.',
    requiredFields: ['orgId', 'title', 'status', 'family', 'estimatedAudienceSize', 'filters', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  communication_automations: {
    collection: 'communication_automations',
    docType: 'CommunicationAutomationDoc',
    description: 'Draft automation definitions for approval-only workflows.',
    requiredFields: ['orgId', 'title', 'triggerType', 'triggerThreshold', 'actionMode', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  communication_approvals: {
    collection: 'communication_approvals',
    docType: 'CommunicationApprovalDoc',
    description: 'Approval queue items for AI-generated or scheduled content.',
    requiredFields: ['orgId', 'title', 'entityType', 'relatedCollection', 'relatedDocumentId', 'status', 'priority', 'requestedByUid', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
  communication_audits: {
    collection: 'communication_audits',
    docType: 'CommunicationAuditDoc',
    description: 'Audit records for prompts, approvals and rollback references.',
    requiredFields: ['orgId', 'title', 'entityType', 'entityCollection', 'entityId', 'actionType', 'actorId', 'actorRole', 'beforeState', 'afterState', 'safety'],
    orgScoped: true,
    draftOnly: true,
  },
};

export const COMMUNICATION_DRAFT_SAFETY: CommunicationSafety = {
  mode: 'draft_only',
  mockOnly: true,
  approvalRequired: true,
  provider: 'none',
  canAutoSend: false,
};