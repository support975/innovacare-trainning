import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { EventsService } from '../../../../shared/services/events.service';
import { LanguageService } from '../../../../shared/services/language';
import { PublicSiteNavComponent } from '../../../../shared/components/public-site-nav/public-site-nav';
import { Tilt3dDirective } from '../../../../shared/directives/tilt-3d.directive';
import { WebinarEvent } from '../../../../data/models';

interface WebinarCardVm {
  event: WebinarEvent;
  isFree: boolean;
  guestPrice: number;
}

@Component({
  selector: 'app-webinars-page',
  standalone: true,
  imports: [CommonModule, RouterModule, PublicSiteNavComponent, Tilt3dDirective],
  templateUrl: './webinars-page.html',
  styleUrl: './webinars-page.css',
})
export class WebinarsPageComponent {
  private readonly eventsService = inject(EventsService);
  private readonly language = inject(LanguageService);

  private readonly publicEvents = toSignal(this.eventsService.listPublicEvents(), {
    initialValue: [] as WebinarEvent[],
  });

  readonly cards = computed<WebinarCardVm[]>(() => {
    const now = Date.now();
    return this.publicEvents()
      .filter((event) => {
        const ms = event.schedule?.date?.toMillis?.() as number | undefined;
        return ms === undefined || ms >= now - 1000 * 60 * 60 * 6; // grace window for in-progress sessions
      })
      .map((event) => ({
        event,
        isFree: (event.pricing?.guestPrice ?? 0) === 0,
        guestPrice: event.pricing?.guestPrice ?? 0,
      }));
  });

  t(key: string): string {
    return this.language.t(key);
  }

  formatDateShort(event: WebinarEvent): { day: string; month: string } {
    const date = event.schedule?.date?.toDate?.() as Date | undefined;
    if (!date) return { day: '--', month: '' };
    return {
      day: date.toLocaleDateString(undefined, { day: '2-digit' }),
      month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    };
  }

  formatTime(event: WebinarEvent): string {
    return `${event.schedule.startTime}–${event.schedule.endTime} ${event.schedule.timezone}`;
  }
}
