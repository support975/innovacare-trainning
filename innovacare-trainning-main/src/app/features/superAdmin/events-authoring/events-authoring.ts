import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp, deleteField } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';

import { EventsService } from '../../../shared/services/events.service';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { WebinarEvent } from '../../../data/models';

type EventForm = {
  id: string;
  title: string;
  description: string;
  ownerOrgId: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  timezone: string;
  memberPrice: number;
  guestPrice: number;
  isPublic: boolean;
  zoomJoinUrl: string;
  active: boolean;
  status: WebinarEvent['status'];
};

function emptyForm(): EventForm {
  return {
    id: '',
    title: '',
    description: '',
    ownerOrgId: '',
    dateStr: '',
    startTime: '13:00',
    endTime: '14:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    memberPrice: 0,
    guestPrice: 0,
    isPublic: true,
    zoomJoinUrl: '',
    active: true,
    status: 'draft',
  };
}

@Component({
  selector: 'app-events-authoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events-authoring.html',
  styleUrl: './events-authoring.css',
})
export class EventsAuthoringComponent {
  private readonly eventsSvc = inject(EventsService);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);

  readonly events = toSignal(this.eventsSvc.listAllForAdmin(), { initialValue: [] as WebinarEvent[] });
  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });

  readonly selectedOrgIds = signal(new Set<string>());
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: EventForm = emptyForm();

  readonly orgMap = computed(() => {
    const map = new Map<string, SuperAdminOrganization>();
    this.organizations().forEach((org) => {
      if (org.id) map.set(org.id, org);
    });
    return map;
  });

  toggleOrg(orgId: string | undefined, checked: boolean): void {
    if (!orgId) return;
    const next = new Set(this.selectedOrgIds());
    if (checked) next.add(orgId);
    else next.delete(orgId);
    this.selectedOrgIds.set(next);
  }

  edit(event: WebinarEvent): void {
    const date = event.schedule?.date?.toDate?.() as Date | undefined;
    this.form = {
      id: event.id || '',
      title: event.title || '',
      description: event.description || '',
      ownerOrgId: event.ownerOrgId || '',
      dateStr: date ? date.toISOString().slice(0, 10) : '',
      startTime: event.schedule?.startTime || '13:00',
      endTime: event.schedule?.endTime || '14:00',
      timezone: event.schedule?.timezone || emptyForm().timezone,
      memberPrice: event.pricing?.memberPrice ?? 0,
      guestPrice: event.pricing?.guestPrice ?? 0,
      isPublic: event.isPublic !== false,
      zoomJoinUrl: event.zoom?.joinUrl || '',
      active: event.active !== false,
      status: event.status || 'draft',
    };
    this.selectedOrgIds.set(new Set(event.assignedOrgIds || []));
    this.notice.set('');
    this.error.set(false);
  }

  resetForm(): void {
    this.form = emptyForm();
    this.selectedOrgIds.set(new Set());
  }

  async save(): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    const title = this.form.title.trim();
    const ownerOrgId = this.form.ownerOrgId.trim();
    if (!title || !ownerOrgId || !this.form.dateStr) {
      this.error.set(true);
      this.notice.set('Title, owning organization, and date are required.');
      return;
    }

    this.busy.set(true);
    try {
      const zoomJoinUrl = this.form.zoomJoinUrl.trim();
      const wasEditing = !!this.form.id;

      const basePayload = {
        title,
        description: this.form.description.trim(),
        ownerOrgId,
        assignedOrgIds: Array.from(this.selectedOrgIds()),
        isPublic: this.form.isPublic,
        schedule: {
          date: Timestamp.fromDate(new Date(`${this.form.dateStr}T00:00:00`)),
          startTime: this.form.startTime,
          endTime: this.form.endTime,
          timezone: this.form.timezone,
        },
        pricing: {
          memberPrice: this.form.memberPrice > 0 ? this.form.memberPrice : null,
          guestPrice: this.form.guestPrice,
        },
        active: this.form.active,
        status: this.form.status,
      };

      if (wasEditing) {
        // deleteField() when cleared, so removing the URL on an existing
        // event actually clears it — updateDoc() only touches keys present
        // in the payload, it never removes fields on its own.
        await this.eventsSvc.update(this.form.id, {
          ...basePayload,
          zoom: zoomJoinUrl ? { meetingType: 'webinar', joinUrl: zoomJoinUrl } : (deleteField() as any),
        });
      } else {
        // Omit the zoom key entirely on create (not zoom: undefined) —
        // Firestore rejects undefined field values by default.
        const id = await this.eventsSvc.create({
          ...basePayload,
          ...(zoomJoinUrl ? { zoom: { meetingType: 'webinar' as const, joinUrl: zoomJoinUrl } } : {}),
        });
        this.form.id = id;
      }
      this.notice.set(wasEditing ? 'Event saved.' : 'Event created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to save event.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(event: WebinarEvent): Promise<void> {
    if (!event.id) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.eventsSvc.delete(event.id);
      this.notice.set('Event deleted.');
      if (this.form.id === event.id) this.resetForm();
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to delete event.');
    } finally {
      this.busy.set(false);
    }
  }

  orgName(orgId: string): string {
    return this.orgMap().get(orgId)?.name || orgId;
  }

  ownerName(event: WebinarEvent): string {
    return this.orgName(event.ownerOrgId);
  }

  formatDate(event: WebinarEvent): string {
    const date = event.schedule?.date?.toDate?.() as Date | undefined;
    if (!date) return 'No date';
    return `${date.toLocaleDateString()} · ${event.schedule.startTime}–${event.schedule.endTime} ${event.schedule.timezone}`;
  }
}
