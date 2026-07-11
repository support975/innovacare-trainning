import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { SuperAdminOrganization } from '../../models/super-admin.models';

@Component({
  selector: 'app-delete',
  imports: [CommonModule, RouterLink],
  templateUrl: './delete.html',
  styleUrl: './delete.css',
})
export class Delete implements OnInit {
  private orgSvc = inject(SuperAdminOrganizationsService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  orgId   = '';
  org     = signal<SuperAdminOrganization | null>(null);
  loading = signal(true);
  busy    = signal(false);
  notice  = signal('');

  ngOnInit() {
    this.orgId = this.route.snapshot.paramMap.get('id') ?? '';
    this.orgSvc.getById(this.orgId).subscribe(org => { this.org.set(org); this.loading.set(false); });
  }

  async confirm() {
    this.busy.set(true);
    try {
      await this.orgSvc.delete(this.orgId);
      this.router.navigate(['/super-admin/organizations']);
    } catch (e: any) {
      this.notice.set(e?.message || 'Delete failed.'); this.busy.set(false);
    }
  }
}
