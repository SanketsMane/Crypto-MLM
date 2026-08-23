/**
 * The permission catalogue. Every gated capability in the console has a key
 * here; routes reference the key, never a role name. Adding a permission is a
 * one-line change plus a reseed — adding a ROLE needs no code at all.
 */
export interface PermissionDef { key: string; group: string; label: string; description?: string }

export const PERMISSIONS: PermissionDef[] = [
  { key: 'dashboard.view',      group: 'Dashboard', label: 'View dashboard' },
  { key: 'reports.view',        group: 'Dashboard', label: 'View reports' },

  { key: 'users.view',          group: 'Users',     label: 'View customers' },
  { key: 'users.status',        group: 'Users',     label: 'Change customer status', description: 'Activate, suspend or block an account' },
  { key: 'users.mode',          group: 'Users',     label: 'Change cap mode', description: 'Switch between the 250% and 300% ceiling' },
  { key: 'users.impersonate',   group: 'Users',     label: 'View as member', description: 'Open a read-only view of a member account for support' },
  { key: 'users.adjust',        group: 'Users',     label: 'Adjust balances', description: 'Post a manual credit or debit to a wallet' },
  { key: 'users.recalc',        group: 'Users',     label: 'Recalculate team volume' },
  { key: 'users.create',        group: 'Users',     label: 'Create member accounts', description: 'Register a member on their behalf' },
  { key: 'users.password',      group: 'Users',     label: 'Reset member passwords' },

  { key: 'deposits.view',       group: 'Finance',   label: 'View deposits' },
  { key: 'deposits.approve',    group: 'Finance',   label: 'Confirm deposits' },
  { key: 'deposits.reject',     group: 'Finance',   label: 'Reject deposits' },
  { key: 'withdrawals.view',    group: 'Finance',   label: 'View withdrawals' },
  { key: 'withdrawals.approve', group: 'Finance',   label: 'Approve withdrawals' },
  { key: 'withdrawals.reject',  group: 'Finance',   label: 'Reject withdrawals' },

  { key: 'plan.view',           group: 'Plan',      label: 'View compensation plan' },
  { key: 'plan.edit',           group: 'Plan',      label: 'Edit compensation plan', description: 'Packages, commission levels, ranks and Roaming Club' },
  { key: 'roaming.fulfil',      group: 'Plan',      label: 'Fulfil Roaming Club awards' },

  { key: 'support.view',        group: 'Support',   label: 'View support tickets' },
  { key: 'support.manage',      group: 'Support',   label: 'Reply and close tickets', description: 'Answer members and change ticket status' },

  { key: 'kyc.view',            group: 'Compliance', label: 'View KYC submissions' },
  { key: 'kyc.review',          group: 'Compliance', label: 'Approve or reject KYC', description: 'Decide identity verification outcomes' },

  { key: 'jobs.view',           group: 'System',    label: 'View payout engine' },
  { key: 'jobs.run',            group: 'System',    label: 'Run the daily payout by hand', description: 'Idempotent — a day that already accrued is a no-op' },

  { key: 'announcements.view',  group: 'System',    label: 'View announcements' },
  { key: 'announcements.manage',group: 'System',    label: 'Write announcements', description: 'Draft and edit, but not send' },
  { key: 'announcements.send',  group: 'System',    label: 'Send announcements', description: 'Publish to every member — cannot be unsent' },
  { key: 'simulation.run',      group: 'System',    label: 'Dry run', description: 'Model the compensation plan against a synthetic member base, and erase it afterwards' },
  { key: 'platform.maintenance',group: 'System',    label: 'Maintenance mode', description: 'Close the platform to members' },
  { key: 'errors.view',         group: 'System',    label: 'View faults', description: 'See the errors the platform has thrown, grouped and counted' },
  { key: 'errors.resolve',      group: 'System',    label: 'Resolve faults', description: 'Mark a fault dealt with — it reopens by itself if it happens again' },

  { key: 'settings.view',       group: 'System',    label: 'View settings' },
  { key: 'settings.edit',       group: 'System',    label: 'Edit settings' },
  { key: 'audit.view',          group: 'System',    label: 'View audit log' },

  { key: 'admins.view',         group: 'Access',    label: 'View admin accounts' },
  { key: 'admins.manage',       group: 'Access',    label: 'Create and edit admins' },
  { key: 'roles.view',          group: 'Access',    label: 'View roles' },
  { key: 'roles.manage',        group: 'Access',    label: 'Create and edit roles', description: 'Define new admin levels and their permissions' },
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);

/** Starting roles. Editable in the console; only the owner role is locked. */
export const DEFAULT_ROLES = [
  {
    name: 'Super Admin', slug: 'super-admin', level: 0, isSystem: true,
    description: 'Full access. Cannot be deleted.',
    permissions: ALL_KEYS,
  },
  {
    name: 'Operations Manager', slug: 'operations-manager', level: 10, isSystem: false,
    description: 'Runs day-to-day operations but cannot change access or the plan.',
    permissions: ALL_KEYS.filter((k) =>
      !k.startsWith('roles.') && !k.startsWith('admins.') && k !== 'settings.edit' && k !== 'plan.edit'),
  },
  {
    name: 'Finance Officer', slug: 'finance-officer', level: 20, isSystem: false,
    description: 'Approves money movements only.',
    permissions: [
      'announcements.view', 'announcements.manage',
      'dashboard.view', 'reports.view', 'users.view', 'users.adjust',
      'deposits.view', 'deposits.approve', 'deposits.reject',
      'withdrawals.view', 'withdrawals.approve', 'withdrawals.reject',
      'audit.view',
    ],
  },
  {
    name: 'Support Agent', slug: 'support-agent', level: 30, isSystem: false,
    description: 'Read-only, for answering customer queries.',
    permissions: ['dashboard.view', 'users.view', 'deposits.view', 'withdrawals.view', 'plan.view', 'audit.view'],
  },
];
