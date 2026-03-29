import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgClass } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <span class="badge">Perry Home Wound Care</span>
        <span>Training</span>
      </div>
      <nav>
        <a routerLink="/learner" class="btn ghost">Learner</a>
        <a routerLink="/manager" class="btn outline">Manager</a>
      </nav>
    </header>

    <aside class="app-sidebar">
      <nav class="nav">
        <a routerLink="/learner" routerLinkActive="active">My Trainings</a>
        <a routerLink="/manager" routerLinkActive="active">Dashboard</a>
        <a routerLink="/courses/wound-essentials-1" routerLinkActive="active">Wound Essentials I</a>
        <a routerLink="/courses/wound-essentials-2" routerLinkActive="active">Wound Essentials II</a>
      </nav>
    </aside>

    <main class="app-content">
      <div class="container">
        <router-outlet></router-outlet>
      </div>
    </main>
  </div>
  `
})
export class LayoutComponent {}
