import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { ProgressService } from '../data/progress-service';
import { inject } from '@angular/core';

export const examReadyCanMatch: CanMatchFn = async (route: Route, segments: UrlSegment[]) => {
  const courseId = segments[0]?.path; // /courses/:id/exam → first is id
  if (!courseId) return false;
  const svc = inject(ProgressService);
  return await svc.canTakeExam(courseId);
};
