export interface UserAccountProfile {
    id: string;
    username: string;
    fullName: string;
    email: string;
    phone: string;
    department: string;
    branch: string;
    role: string;
    active: boolean;
    revision: string;
    canEdit: boolean;
    canSend: boolean;
    canSetPassword: boolean;
    restrictionReason: string;
    lastMail: UserAccountMail | null;
}
export interface UserAccountMail {
    requestId: string;
    status: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
    createdAt: string;
    updatedAt: string;
}
export interface UserAccountReadiness {
    ready: boolean;
    message: string;
}
export interface UserAccountsResponse {
    success: boolean;
    users: UserAccountProfile[];
    mailReadiness: UserAccountReadiness;
}
export interface UserAccountMeResponse {
    success: boolean;
    user: UserAccountProfile;
    mailReadiness: UserAccountReadiness;
}
export interface UserAccountMutation {
    expectedRevision: string;
    actingPassword: string;
    requestId: string;
}
export interface UserAccountProfileInput extends UserAccountMutation {
    fullName: string;
    email: string;
    phone: string;
    department: string;
    branch: string;
}
export interface UserAccountPasswordInput extends UserAccountMutation {
    newPassword: string;
    confirmPassword: string;
}
export type UserAccountPasswordEmailInput = UserAccountMutation;
