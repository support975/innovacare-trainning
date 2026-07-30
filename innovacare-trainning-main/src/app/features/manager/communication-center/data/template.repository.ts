import { Injectable } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CommunicationCenterRepository } from './communication-center.repository';
import {
  CommunicationRepositoryState,
  CommunicationTemplateDoc,
  CreateTemplateDraftPayload,
} from '../contracts/communication.models';

@Injectable({ providedIn: 'root' })
export class TemplateRepository extends CommunicationCenterRepository {
  listTemplates(orgId: string | null): Observable<CommunicationRepositoryState<CommunicationTemplateDoc>> {
    return this.listOrgScoped<CommunicationTemplateDoc>('communication_templates', orgId, orderBy('updatedAt', 'desc'));
  }

  async createTemplateDraft(orgId: string, payload: CreateTemplateDraftPayload): Promise<string> {
    return this.createWithAudit<CommunicationTemplateDoc>({
      collectionName: 'communication_templates',
      entityType: 'template',
      orgId,
      build: (docId, actor, now) => ({
        id: docId,
        orgId,
        title: payload.title.trim(),
        summary: payload.summary.trim(),
        tags: payload.tags ?? [],
        ...this.buildBaseFields(actor, now),
        type: payload.type,
        status: 'draft',
        category: payload.type,
        subjectTemplate: payload.subjectTemplate.trim(),
        previewTextTemplate: payload.previewTextTemplate.trim(),
        htmlTemplate: payload.htmlTemplate.trim(),
        personalizationTokens: payload.personalizationTokens ?? [],
        aiAssistEnabled: payload.aiAssistEnabled ?? true,
      }),
    });
  }
}