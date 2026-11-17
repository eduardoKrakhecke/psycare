
export type UserRole =
  | 'admin'
  | 'psychologist'
  | 'receptionist';

export type OperationalRole =
  Exclude<UserRole, 'admin'>;

export interface ClinicMember {
  uid: string;
  name: string;
  role: UserRole;
  active: boolean;
}
