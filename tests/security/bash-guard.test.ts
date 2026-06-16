import { describe, it, expect } from 'vitest';
import { BashGuard } from '../../src/tools/security/bash-guard.js';

describe('BashGuard', () => {
  it('allows safe commands by default', () => {
    const guard = new BashGuard();
    expect(guard.validate('git status').allowed).toBe(true);
    expect(guard.validate('npm test').allowed).toBe(true);
    expect(guard.validate('echo hello').allowed).toBe(true);
  });

  it('blocks recursive root deletion', () => {
    const guard = new BashGuard();
    const result = guard.validate('rm -rf /');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('blocks Windows format commands', () => {
    const guard = new BashGuard();
    const result = guard.validate('format C:');
    expect(result.allowed).toBe(false);
  });

  it('blocks raw device operations', () => {
    const guard = new BashGuard();
    expect(guard.validate('dd if=/dev/zero of=/dev/sda').allowed).toBe(false);
    expect(guard.validate('mkfs.ext4 /dev/sda1').allowed).toBe(false);
  });

  it('flags sensitive commands like rm by default', () => {
    const guard = new BashGuard();
    const result = guard.validate('rm file.txt');
    expect(result.allowed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('sensitive');
  });

  it('allows dangerous commands when configured', () => {
    const guard = new BashGuard({ allowDangerousCommands: true });
    expect(guard.validate('rm file.txt').allowed).toBe(true);
  });

  it('allows commands matching allowedPatterns', () => {
    const guard = new BashGuard({
      allowedPatterns: ['rm file\\.txt'],
    });
    expect(guard.validate('rm file.txt').allowed).toBe(true);
    expect(guard.validate('rm other.txt').allowed).toBe(false);
  });

  it('blocks commands matching custom blockedPatterns', () => {
    const guard = new BashGuard({
      blockedPatterns: ['evil-command'],
    });
    expect(guard.validate('evil-command').allowed).toBe(false);
    expect(guard.validate('good-command').allowed).toBe(true);
  });

  it('allowedPatterns take precedence over blockedPatterns', () => {
    const guard = new BashGuard({
      blockedPatterns: ['rm'],
      allowedPatterns: ['rm file\\.txt'],
    });
    expect(guard.validate('rm file.txt').allowed).toBe(true);
    expect(guard.validate('rm other.txt').allowed).toBe(false);
  });
});
