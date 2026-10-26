export type DemoApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface DemoApplication {
  id: string;
  applicationNo: string;
  status: DemoApplicationStatus;
  clubName: string;
  contactPerson: string;
  phone: string;
  clientIp?: string;
  clubId?: string;
  coachId?: string;
  clubUsername?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export const DEMO_APPLICATIONS_UPDATED_EVENT = 'netchess-demo-applications-updated';
