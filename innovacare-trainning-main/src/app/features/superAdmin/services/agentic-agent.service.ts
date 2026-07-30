import { Injectable, inject } from '@angular/core';

import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

export type AgentTaskIntent =
  | 'intake'
  | 'marketing_follow_up'
  | 'notification'
  | 'email'
  | 'reminder'
  | 'seo_article'
  | 'lead_follow_up'
  | 'organization_onboarding'
  | 'compliance_certification'
  | 'notification_reminder'
  | 'content_repurpose';

export type AgentTaskStatus =
  | 'new'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'dismissed'
  | 'failed';

export type AgentTaskPriority = 'normal' | 'high' | 'urgent';

export type AgentTaskAction =
  | 'queue_email'
  | 'create_notification'
  | 'request_reminder_scan'
  | 'complete'
  | 'dismiss';

export interface AgentTask {
  id?: string;
  sourceType: 'demoRequest' | 'contact' | 'manual' | 'reminderScan';
  sourceId: string;
  intent: AgentTaskIntent;
  title: string;
  summary: string;
  priority?: AgentTaskPriority;
  status?: AgentTaskStatus;
  channel?: 'email' | 'notification' | 'reminder' | 'phone' | 'mixed';
  leadName?: string | null;
  leadEmail?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
  orgId?: string | null;
  recommendedAction?: string;
  deliveryRef?: string;
  metadata?: {
    suggestedSubject?: string;
    suggestedHtml?: string;
    message?: string;
    selectedPlan?: string;
    reason?: string;
    phone?: string;
    [key: string]: unknown;
  };
  createdAt?: any;
  updatedAt?: any;
  lastAction?: any;
}

export interface AgentTaskActionPayload {
  taskId: string;
  action: AgentTaskAction;
  subject?: string;
  html?: string;
  text?: string;
  to?: string[];
  notificationTitle?: string;
  notificationBody?: string;
  notificationUid?: string;
  orgId?: string;
}

@Injectable({ providedIn: 'root' })
export class AgenticAgentService {
  private readonly afs = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly colRef = collection(this.afs, 'agentTasks');

  list(max = 120): Observable<AgentTask[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'), limit(max));
    return collectionData(q, { idField: 'id' }) as Observable<AgentTask[]>;
  }

  runAction(payload: AgentTaskActionPayload): Promise<unknown> {
    const callable = httpsCallable<AgentTaskActionPayload, unknown>(
      this.functions,
      'runAgentTaskAction'
    );
    return callable(payload).then((result) => result.data);
  }

  backfill(limit = 50): Promise<{ ok: boolean; createdOrUpdated: number }> {
    const callable = httpsCallable<{ limit: number }, { ok: boolean; createdOrUpdated: number }>(
      this.functions,
      'backfillAgentTasks'
    );
    return callable({ limit }).then((result) => result.data);
  }

  markInProgress(taskId: string): Promise<void> {
    return updateDoc(doc(this.afs, `agentTasks/${taskId}`), {
      status: 'in_progress',
      updatedAt: serverTimestamp(),
    });
  }

  createManualTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<unknown> {
    return addDoc(this.colRef, {
      ...task,
      status: task.status || 'ready',
      sourceType: task.sourceType || 'manual',
      sourceId: task.sourceId || `manual_${Date.now()}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
