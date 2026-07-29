import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp, deleteField } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { EventsService } from '../../../shared/services/events.service';
import { FacultyService } from '../../../shared/services/faculty.service';
import { SponsorsService } from '../../../shared/services/sponsors.service';
import { AccreditationService } from '../../../shared/services/accreditation.service';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { Faculty, Sponsor, Accreditation, WebinarEvent } from '../../../data/models';

type EventForm = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  ownerOrgId: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  timezone: string;
  memberPrice: number;
  guestPrice: number;
  capacity: number | null;
  isPublic: boolean;
  zoomJoinUrl: string;
  active: boolean;
  status: WebinarEvent['status'];
  accreditationId: string;
};

function emptyForm(): EventForm {
  return {
    id: '',
    title: '',
    description: '',
    imageUrl: '',
    ownerOrgId: '',
    dateStr: '',
    startTime: '13:00',
    endTime: '14:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    memberPrice: 0,
    guestPrice: 0,
    capacity: null,
    isPublic: true,
    zoomJoinUrl: '',
    active: true,
    status: 'draft',
    accreditationId: '',
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
  private readonly facultySvc = inject(FacultyService);
  private readonly sponsorsSvc = inject(SponsorsService);
  private readonly accreditationSvc = inject(AccreditationService);

  readonly events = toSignal(this.eventsSvc.listAllForAdmin(), { initialValue: [] as WebinarEvent[] });
  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });

  readonly selectedOrgIds = signal(new Set<string>());
  readonly selectedFacultyIds = signal(new Set<string>());
  readonly selectedSponsorIds = signal(new Set<string>());
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  readonly jsonPanelOpen = signal(false);
  readonly jsonText = signal(this.jsonPlaceholder());
  readonly jsonBusy = signal(false);
  readonly jsonNotice = signal('');
  readonly jsonError = signal(false);

  // Faculty/Sponsors/Accreditation are scoped to the form's owning organization,
  // so the picker lists must react to ownerOrgId changes even though the form
  // itself is a plain (non-signal) object bound via ngModel.
  readonly formOwnerOrgId = signal('');

  readonly availableFaculty = toSignal(
    toObservable(this.formOwnerOrgId).pipe(
      switchMap((orgId) => (orgId ? this.facultySvc.listByOrg(orgId) : of([] as Faculty[]))),
    ),
    { initialValue: [] as Faculty[] }
  );

  readonly availableSponsors = toSignal(
    toObservable(this.formOwnerOrgId).pipe(
      switchMap((orgId) => (orgId ? this.sponsorsSvc.listByOrg(orgId) : of([] as Sponsor[]))),
    ),
    { initialValue: [] as Sponsor[] }
  );

  readonly availableAccreditations = toSignal(
    toObservable(this.formOwnerOrgId).pipe(
      switchMap((orgId) => (orgId ? this.accreditationSvc.listByOrg(orgId) : of([] as Accreditation[]))),
    ),
    { initialValue: [] as Accreditation[] }
  );

  form: EventForm = emptyForm();

  readonly orgMap = computed(() => {
    const map = new Map<string, SuperAdminOrganization>();
    this.organizations().forEach((org) => {
      if (org.id) map.set(org.id, org);
    });
    return map;
  });

  private jsonPlaceholder(): string {
    return JSON.stringify(
      [
        {
          title: 'Understanding Microclimate: Using Support Surface Technology',
          description: 'What attendees will learn.',
          imageUrl: '',
          ownerOrgId: 'PASTE_ORG_ID_HERE',
          assignedOrgIds: [],
          isPublic: true,
          facultyIds: [],
          sponsorIds: [],
          accreditationId: '',
          schedule: { date: '2026-08-13', startTime: '13:00', endTime: '14:00', timezone: 'America/New_York' },
          zoomJoinUrl: '',
          pricing: { memberPrice: null, guestPrice: 0 },
          capacity: null,
          status: 'draft',
          active: true,
        },
      ],
      null,
      2
    );
  }

  toggleJsonPanel(): void {
    this.jsonPanelOpen.update((open) => !open);
    this.jsonNotice.set('');
    this.jsonError.set(false);
  }

  async importFromJson(): Promise<void> {
    this.jsonNotice.set('');
    this.jsonError.set(false);

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.jsonText());
    } catch {
      this.jsonError.set(true);
      this.jsonNotice.set('Invalid JSON — please check the syntax.');
      return;
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (!entries.length) {
      this.jsonError.set(true);
      this.jsonNotice.set('No events found in the pasted JSON.');
      return;
    }

    const validOrgIds = new Set(
      this.organizations()
        .map((org) => org.id)
        .filter((id): id is string => !!id)
    );

    this.jsonBusy.set(true);
    let created = 0;
    const failures: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i] as any;
      const label = entry?.title ? `"${entry.title}"` : `entry #${i + 1}`;
      try {
        const payload = this.buildPayloadFromJsonEntry(entry, validOrgIds);
        await this.eventsSvc.create(payload);
        created++;
      } catch (err: any) {
        failures.push(`${label}: ${err?.message || 'unknown error'}`);
      }
    }

    this.jsonBusy.set(false);

    if (failures.length) {
      this.jsonError.set(true);
      this.jsonNotice.set(
        `Created ${created} of ${entries.length} event(s). Failed: ${failures.join('; ')}`
      );
    } else {
      this.jsonNotice.set(`Created ${created} event${created === 1 ? '' : 's'} from JSON.`);
      this.jsonText.set(this.jsonPlaceholder());
      this.jsonPanelOpen.set(false);
    }
  }

  private buildPayloadFromJsonEntry(
    entry: any,
    validOrgIds: Set<string>
  ): Omit<WebinarEvent, 'id' | 'createdAt' | 'updatedAt'> {
    const title = String(entry?.title || '').trim();
    const ownerOrgId = String(entry?.ownerOrgId || '').trim();
    const schedule = entry?.schedule || {};
    const dateStr = String(schedule?.date || '').trim();
    const startTime = String(schedule?.startTime || '').trim();
    const endTime = String(schedule?.endTime || '').trim();
    const timezone = String(schedule?.timezone || '').trim();

    if (!title) throw new Error('title is required');
    if (!ownerOrgId) throw new Error('ownerOrgId is required');
    if (!validOrgIds.has(ownerOrgId)) throw new Error(`ownerOrgId "${ownerOrgId}" does not match a known organization`);
    if (!dateStr || !startTime || !endTime || !timezone) {
      throw new Error('schedule.date, schedule.startTime, schedule.endTime, and schedule.timezone are required');
    }
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new Error(`schedule.date "${dateStr}" is not a valid date (use YYYY-MM-DD)`);

    const zoomJoinUrl = String(entry?.zoomJoinUrl || entry?.zoom?.joinUrl || '').trim();
    const accreditationId = String(entry?.accreditationId || '').trim();
    const imageUrl = String(entry?.imageUrl || '').trim();
    const capacityRaw = entry?.capacity;
    const capacity = typeof capacityRaw === 'number' && capacityRaw > 0 ? capacityRaw : null;
    const memberPriceRaw = entry?.pricing?.memberPrice;
    const memberPrice = typeof memberPriceRaw === 'number' && memberPriceRaw > 0 ? memberPriceRaw : null;
    const guestPrice = typeof entry?.pricing?.guestPrice === 'number' ? entry.pricing.guestPrice : 0;

    return {
      title,
      description: String(entry?.description || '').trim(),
      ownerOrgId,
      assignedOrgIds: Array.isArray(entry?.assignedOrgIds) ? entry.assignedOrgIds.map(String) : [],
      facultyIds: Array.isArray(entry?.facultyIds) ? entry.facultyIds.map(String) : [],
      sponsorIds: Array.isArray(entry?.sponsorIds) ? entry.sponsorIds.map(String) : [],
      isPublic: entry?.isPublic !== false,
      schedule: { date: Timestamp.fromDate(date), startTime, endTime, timezone },
      pricing: { memberPrice, guestPrice },
      active: entry?.active !== false,
      status: (['draft', 'published', 'live', 'completed', 'cancelled'] as const).includes(entry?.status)
        ? entry.status
        : 'draft',
      ...(zoomJoinUrl ? { zoom: { meetingType: 'webinar' as const, joinUrl: zoomJoinUrl } } : {}),
      ...(accreditationId ? { accreditationId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(capacity !== null ? { capacity } : {}),
    };
  }

  toggleOrg(orgId: string | undefined, checked: boolean): void {
    if (!orgId) return;
    const next = new Set(this.selectedOrgIds());
    if (checked) next.add(orgId);
    else next.delete(orgId);
    this.selectedOrgIds.set(next);
  }

  toggleFaculty(facultyId: string | undefined, checked: boolean): void {
    if (!facultyId) return;
    const next = new Set(this.selectedFacultyIds());
    if (checked) next.add(facultyId);
    else next.delete(facultyId);
    this.selectedFacultyIds.set(next);
  }

  toggleSponsor(sponsorId: string | undefined, checked: boolean): void {
    if (!sponsorId) return;
    const next = new Set(this.selectedSponsorIds());
    if (checked) next.add(sponsorId);
    else next.delete(sponsorId);
    this.selectedSponsorIds.set(next);
  }

  onOwnerOrgChange(orgId: string): void {
    this.form.ownerOrgId = orgId;
    this.formOwnerOrgId.set(orgId);
    this.selectedFacultyIds.set(new Set());
    this.selectedSponsorIds.set(new Set());
    this.form.accreditationId = '';
  }

  edit(event: WebinarEvent): void {
    const date = event.schedule?.date?.toDate?.() as Date | undefined;
    this.form = {
      id: event.id || '',
      title: event.title || '',
      description: event.description || '',
      imageUrl: event.imageUrl || '',
      ownerOrgId: event.ownerOrgId || '',
      dateStr: date ? date.toISOString().slice(0, 10) : '',
      startTime: event.schedule?.startTime || '13:00',
      endTime: event.schedule?.endTime || '14:00',
      timezone: event.schedule?.timezone || emptyForm().timezone,
      memberPrice: event.pricing?.memberPrice ?? 0,
      guestPrice: event.pricing?.guestPrice ?? 0,
      capacity: event.capacity ?? null,
      isPublic: event.isPublic !== false,
      zoomJoinUrl: event.zoom?.joinUrl || '',
      active: event.active !== false,
      status: event.status || 'draft',
      accreditationId: event.accreditationId || '',
    };
    this.selectedOrgIds.set(new Set(event.assignedOrgIds || []));
    this.selectedFacultyIds.set(new Set(event.facultyIds || []));
    this.selectedSponsorIds.set(new Set(event.sponsorIds || []));
    this.formOwnerOrgId.set(this.form.ownerOrgId);
    this.notice.set('');
    this.error.set(false);
  }

  resetForm(): void {
    this.form = emptyForm();
    this.selectedOrgIds.set(new Set());
    this.selectedFacultyIds.set(new Set());
    this.selectedSponsorIds.set(new Set());
    this.formOwnerOrgId.set('');
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

      const accreditationId = this.form.accreditationId.trim();
      const imageUrl = this.form.imageUrl.trim();

      const basePayload = {
        title,
        description: this.form.description.trim(),
        ownerOrgId,
        assignedOrgIds: Array.from(this.selectedOrgIds()),
        facultyIds: Array.from(this.selectedFacultyIds()),
        sponsorIds: Array.from(this.selectedSponsorIds()),
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

      const capacity = this.form.capacity !== null && this.form.capacity > 0 ? this.form.capacity : null;

      if (wasEditing) {
        // deleteField() when cleared, so removing the URL/accreditation/image/
        // capacity on an existing event actually clears it — updateDoc() only
        // touches keys present in the payload, it never removes fields on its own.
        await this.eventsSvc.update(this.form.id, {
          ...basePayload,
          zoom: zoomJoinUrl ? { meetingType: 'webinar', joinUrl: zoomJoinUrl } : (deleteField() as any),
          accreditationId: accreditationId ? accreditationId : (deleteField() as any),
          imageUrl: imageUrl ? imageUrl : (deleteField() as any),
          capacity: capacity !== null ? capacity : (deleteField() as any),
        });
      } else {
        // Omit the zoom/accreditationId/imageUrl/capacity keys entirely on
        // create (not set to undefined) — Firestore rejects undefined field
        // values by default.
        const id = await this.eventsSvc.create({
          ...basePayload,
          ...(zoomJoinUrl ? { zoom: { meetingType: 'webinar' as const, joinUrl: zoomJoinUrl } } : {}),
          ...(accreditationId ? { accreditationId } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          ...(capacity !== null ? { capacity } : {}),
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

  facultyName(facultyId: string): string {
    return this.availableFaculty().find((f) => f.id === facultyId)?.name || facultyId;
  }

  sponsorName(sponsorId: string): string {
    return this.availableSponsors().find((s) => s.id === sponsorId)?.name || sponsorId;
  }

  accreditationLabel(accreditation: Accreditation): string {
    return `${accreditation.accreditingOrganization} — ${accreditation.contactHours} contact hrs`;
  }

  initials(name: string | undefined): string {
    const source = (name || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
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
