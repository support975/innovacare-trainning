import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
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
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
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
  private readonly auth = inject(Auth);
  private readonly colRef = collection(this.afs, 'agentTasks');

  list(max = 120): Observable<AgentTask[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'), limit(max));
    return collectionData(q, { idField: 'id' }) as Observable<AgentTask[]>;
  }

  async runAction(payload: AgentTaskActionPayload): Promise<unknown> {
    const taskRef = doc(this.afs, `agentTasks/${payload.taskId}`);
    const deliveryRef = `${payload.action}_${Date.now()}`;
    const currentUser = this.auth.currentUser;

    if (payload.action === 'queue_email') {
      await addDoc(collection(this.afs, 'mail'), {
        to: payload.to || [],
        message: {
          subject: payload.subject || 'Innovacare Training follow-up',
          html: payload.html || '',
          text: payload.text || '',
        },
        metadata: {
          source: 'agent-center',
          sourceTaskId: payload.taskId,
        },
        createdAt: serverTimestamp(),
      });
    }

    if (payload.action === 'create_notification') {
      await addDoc(collection(this.afs, 'notifications'), {
        title: payload.notificationTitle || 'Innovacare Training update',
        body: payload.notificationBody || payload.text || '',
        audience: payload.notificationUid
          ? { type: 'user', uid: payload.notificationUid }
          : { type: 'organization', orgId: payload.orgId || null },
        severity: 'info',
        link: '/super-admin/agent-center',
        createdBy: {
          uid: currentUser?.uid || 'super-admin',
          name: currentUser?.displayName || currentUser?.email || 'Super Admin',
        },
        createdAt: serverTimestamp(),
      });
    }

    if (payload.action === 'request_reminder_scan') {
      await addDoc(collection(this.afs, 'smartReminderScanRequests'), {
        orgId: payload.orgId || '',
        status: 'pending',
        requestedByUid: currentUser?.uid || '',
        requestedByEmail: currentUser?.email || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const nextStatus =
      payload.action === 'complete'
        ? 'completed'
        : payload.action === 'dismiss'
          ? 'dismissed'
          : 'in_progress';

    await updateDoc(taskRef, {
      status: nextStatus,
      deliveryRef,
      updatedAt: serverTimestamp(),
      lastAction: {
        action: payload.action,
        at: serverTimestamp(),
      },
    });

    return { ok: true, deliveryRef };
  }

  async backfill(limit = 50): Promise<{ ok: boolean; createdOrUpdated: number }> {
    const demoTasks = [
      {
        sourceType: 'manual' as const,
        sourceId: `seo_article_${Date.now()}`,
        intent: 'seo_article' as AgentTaskIntent,
        title: 'Create SEO article pack',
        summary: 'Prepare a searchable article and social snippets to promote Innovacare Training.',
        priority: 'normal' as AgentTaskPriority,
        status: 'ready' as AgentTaskStatus,
        channel: 'mixed' as const,
        recommendedAction: 'Draft article, meta description, and LinkedIn/Facebook/WhatsApp copy.',
      },
      {
        sourceType: 'manual' as const,
        sourceId: `reminder_${Date.now()}`,
        intent: 'notification_reminder' as AgentTaskIntent,
        title: 'Review learner reminder opportunities',
        summary: 'Check overdue, inactive, and upcoming learner assignments for reminder outreach.',
        priority: 'high' as AgentTaskPriority,
        status: 'ready' as AgentTaskStatus,
        channel: 'reminder' as const,
        recommendedAction: 'Create a reminder scan request for the target organization.',
      },
    ].slice(0, Math.max(1, Math.min(limit, 2)));

    await Promise.all(
      demoTasks.map((task) =>
        setDoc(doc(this.afs, `agentTasks/${task.sourceId}`), {
          ...task,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      )
    );

    return { ok: true, createdOrUpdated: demoTasks.length };
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
