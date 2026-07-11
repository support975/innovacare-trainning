import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface CheckItem { label: string; desc: string; done: boolean; icon: string; }

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './setup.html',
  styleUrls: ['./setup.css'],
})
export class Setup {
  steps = signal<CheckItem[]>([
    { label: 'Create first organisation', desc: 'Add a tenant organisation with an owner account.', done: false, icon: '🏢' },
    { label: 'Add courses to the catalogue', desc: 'Upload or import training courses for learners.', done: false, icon: '▣' },
    { label: 'Assign courses to organisations', desc: 'Make courses available to specific organisations.', done: false, icon: '▤' },
    { label: 'Invite managers', desc: 'Set up manager accounts and link them to organisations.', done: false, icon: '◎' },
    { label: 'Configure billing', desc: 'Set plan and billing details for each organisation.', done: false, icon: '💳' },
    { label: 'Review security settings', desc: 'Set session timeout, MFA policy, and password rules.', done: false, icon: '🔒' },
    { label: 'Test a learner account', desc: 'Sign in as a learner and complete a course end-to-end.', done: false, icon: '✓' },
  ]);

  doneCount = computed(() => this.steps().filter(x => x.done).length);

  progress = computed(() => {
    const s = this.steps();
    return Math.round((this.doneCount() / s.length) * 100);
  });

  toggle(i: number) {
    this.steps.update(list => list.map((s, idx) => idx === i ? { ...s, done: !s.done } : s));
  }
}
