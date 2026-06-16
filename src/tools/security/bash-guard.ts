export interface BashSecurityConfig {
  blockedPatterns?: string[];
  allowedPatterns?: string[];
  allowDangerousCommands?: boolean;
}

interface GuardResult {
  allowed: boolean;
  reason?: string;
}

const DEFAULT_BLOCKED_PATTERNS: string[] = [
  // Recursive deletion of root or system directories
  'rm\\s+-[a-zA-Z]*rf\\s+/(?:\\s|$)',
  'rm\\s+-[a-zA-Z]*rf\\s+/\\*',
  'rm\\s+-[a-zA-Z]*rf\\s+~/(?:\\s|$)',
  // Windows format
  'format\\s+[a-zA-Z]:',
  // Windows recursive delete of system drive
  'del\\s+/[afqs]+\\s+.*[cC]:\\\\\\\\',
  'rmdir\\s+/[sq]+\\s+.*[cC]:\\\\\\\\',
  // Partition/filesystem tools on raw devices
  'mkfs\\.[a-z0-9]+\\s+/dev/',
  'fdisk\\s+/dev/',
  'parted\\s+/dev/',
  // dd writing to block devices or dangerous targets
  'dd\\s+.*\\s+of=/dev/[sh]d',
  'dd\\s+.*\\s+of=/dev/null',
  // Raw device redirection
  '>/dev/[sh]d[a-z]',
  '>/dev/mem',
  '>/dev/port',
  '>/dev/zero\\s+of=/dev/',
  // System power commands
  '\\bshutdown\\b',
  '\\breboot\\b',
  '\\bpoweroff\\b',
  '\\bhalt\\b',
];

const SENSITIVE_COMMAND_PATTERNS: string[] = [
  '\\brm\\b',
  '\\bdel\\b',
  '\\brmdir\\b',
  '\\bformat\\b',
  '\\bmkfs\\b',
  '\\bdd\\b',
  '\\bmkfs\\.[a-z0-9]+\\b',
];

export class BashGuard {
  private blockedPatterns: RegExp[];
  private allowedPatterns: RegExp[];
  private allowDangerousCommands: boolean;

  constructor(config?: BashSecurityConfig) {
    this.blockedPatterns = [
      ...DEFAULT_BLOCKED_PATTERNS.map((p) => new RegExp(p, 'i')),
      ...(config?.blockedPatterns ?? []).map((p) => new RegExp(p, 'i')),
    ];
    this.allowedPatterns = (config?.allowedPatterns ?? []).map(
      (p) => new RegExp(p, 'i')
    );
    this.allowDangerousCommands = config?.allowDangerousCommands ?? false;
  }

  validate(command: string): GuardResult {
    if (this.allowedPatterns.some((pattern) => pattern.test(command))) {
      return { allowed: true };
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason:
            'Command blocked by security policy: potentially destructive or system-wide operation. ' +
            'If you are sure this is safe, add it to tools.security.bash.allowedPatterns in config.yaml.',
        };
      }
    }

    if (!this.allowDangerousCommands) {
      for (const pattern of SENSITIVE_COMMAND_PATTERNS) {
        if (new RegExp(pattern, 'i').test(command)) {
          return {
            allowed: false,
            reason:
              'Command flagged as sensitive/destructive. ' +
              'Set tools.security.bash.allowDangerousCommands to true to allow, or add a specific allowed pattern.',
          };
        }
      }
    }

    return { allowed: true };
  }
}
