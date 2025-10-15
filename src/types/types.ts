import type { Database } from './database.types';

export type PrintJob = Database['public']['Tables']['print_jobs']['Row'];
export type Template = Database['public']['Tables']['templates']['Row'];
export type JobStatus = Database['public']['Enums']['job_status'];
