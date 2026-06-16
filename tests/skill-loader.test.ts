import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillLoader } from '../src/skills/skill-loader.js';

describe('SkillLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSkill(
    dirName: string,
    name: string,
    description: string,
    body: string
  ): void {
    const dir = path.join(tempDir, dirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      [`---`, `name: ${name}`, `description: ${description}`, `---`, body].join(
        '\n'
      ),
      'utf8'
    );
  }

  it('discovers skills recursively', () => {
    writeSkill('skill-a', 'skill_a', 'Skill A', 'Content A');
    writeSkill('nested/skill-b', 'skill_b', 'Skill B', 'Content B');

    const loader = new SkillLoader(tempDir);
    const skills = loader.discoverSkills();

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['skill_a', 'skill_b']);
  });

  it('skips duplicate skill names', () => {
    writeSkill('skill-a', 'duplicate', 'First', 'First content');
    writeSkill('skill-b', 'duplicate', 'Second', 'Second content');

    const loader = new SkillLoader(tempDir);
    const skills = loader.discoverSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('First');
  });

  it('loads a valid skill', () => {
    writeSkill('skill-a', 'test_skill', 'Test skill', 'Body content');

    const loader = new SkillLoader(tempDir);
    const skill = loader.loadSkill(path.join(tempDir, 'skill-a', 'SKILL.md'));

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('test_skill');
    expect(skill?.description).toBe('Test skill');
    expect(skill?.content).toContain('Body content');
  });

  it('returns null for invalid frontmatter', () => {
    const dir = path.join(tempDir, 'bad-skill');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      'No frontmatter here\n',
      'utf8'
    );

    const loader = new SkillLoader(tempDir);
    const skill = loader.loadSkill(path.join(dir, 'SKILL.md'));

    expect(skill).toBeNull();
  });

  it('returns null for invalid YAML', () => {
    const dir = path.join(tempDir, 'bad-skill');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      ['---', 'name: [invalid', '---', 'body'].join('\n'),
      'utf8'
    );

    const loader = new SkillLoader(tempDir);
    const skill = loader.loadSkill(path.join(dir, 'SKILL.md'));

    expect(skill).toBeNull();
  });

  it('retrieves skills by name and lists names', () => {
    writeSkill('skill-a', 'alpha', 'Alpha skill', 'Alpha content');

    const loader = new SkillLoader(tempDir);
    loader.discoverSkills();

    expect(loader.listSkills()).toEqual(['alpha']);
    expect(loader.getSkill('alpha')?.name).toBe('alpha');
    expect(loader.getSkill('missing')).toBeUndefined();
  });

  it('generates metadata prompt', () => {
    writeSkill('skill-a', 'alpha', 'Alpha skill', 'Alpha content');
    writeSkill('skill-b', 'beta', 'Beta skill', 'Beta content');

    const loader = new SkillLoader(tempDir);
    loader.discoverSkills();

    const prompt = loader.getSkillsMetadataPrompt();
    expect(prompt).toContain('alpha');
    expect(prompt).toContain('Alpha skill');
    expect(prompt).toContain('beta');
    expect(prompt).toContain('Beta skill');
  });

  it('returns empty metadata prompt when no skills', () => {
    const loader = new SkillLoader(tempDir);
    expect(loader.getSkillsMetadataPrompt()).toBe('');
  });
});
