import { TestBed } from '@angular/core/testing';

import { DemoRequest } from './demo-request';

describe('DemoRequest', () => {
  let service: DemoRequest;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DemoRequest);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
