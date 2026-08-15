import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DemoService } from '../../../shared/services/demo.service';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';

@Component({
  selector: 'app-try-demo',
  standalone: true,
  imports: [CommonModule, RouterModule, PublicTranslateDirective],
  templateUrl: './try-demo.html',
  styleUrl: './try-demo.css',
})
export class TryDemoComponent implements OnInit {
  private readonly demo = inject(DemoService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    void this.launch();
  }

  async launch(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.demo.start();
      await this.router.navigate(['/manager/dashboard']);
    } catch (e: any) {
      this.error.set(e?.message || "Impossible de démarrer la démonstration. Veuillez réessayer.");
      this.loading.set(false);
    }
  }
}
