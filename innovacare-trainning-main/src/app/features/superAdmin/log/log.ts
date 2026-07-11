import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { SuperAdminLogsService } from '../services/super-admin-logs';
import { SuperAdminLog } from '../models/super-admin.models';

@Component({
  selector: 'app-log',
  imports: [CommonModule, FormsModule],
  templateUrl: './log.html',
  styleUrl: './log.css',
})
export class Log {
  private svc = inject(SuperAdminLogsService);

  severityFilter = signal<'all' | 'info' | 'warning' | 'critical'>('all');
  search = signal('');

  logs = toSignal(this.svc.listRecent(200), { initialValue: [] as SuperAdminLog[] });

  filtered = computed(() => {
    const s = this.severityFilter();
    const q = this.search().toLowerCase().trim();
    return this.logs().filter(l => {
      const matchSev = s === 'all' || l.severity === s;
      const blob = `${l.action ?? ''} ${l.message ?? ''} ${l.actorEmail ?? ''} ${l.targetType ?? ''}`.toLowerCase();
      return matchSev && (!q || blob.includes(q));
    });
  });

  stats = computed(() => {
    const all = this.logs();
    return {
      total: all.length,
      critical: all.filter(l => l.severity === 'critical').length,
      warning: all.filter(l => l.severity === 'warning').length,
      info: all.filter(l => l.severity === 'info').length,
    };
  });

  formatDate(val: any): string {
    if (!val) return '—';
    const d = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
    return isNaN(+d) ? '—' : d.toLocaleString();
  }
}
