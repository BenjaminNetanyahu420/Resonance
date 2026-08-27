import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from './defaults';
import { migrateProject, parseProject, serializeProject } from './schema';

describe('project schema', () => {
  it('round-trips the current schema without losing stable IDs', () => {
    const parsed = parseProject(serializeProject(DEFAULT_PROJECT));
    expect(parsed.version).toBe(2);
    expect(parsed.layers.map((layer) => layer.id)).toEqual(DEFAULT_PROJECT.layers.map((layer) => layer.id));
    expect(parsed.scene).toEqual(DEFAULT_PROJECT.scene);
  });

  it('migrates legacy scene-only projects and preserves the visual settings', () => {
    const migrated = migrateProject({ version: 1, scene: { ...DEFAULT_PROJECT.scene, glow: 2.2 }, export: { width: 1280, height: 720, fps: 30, bitrate: 4_000_000 } });
    expect(migrated.version).toBe(2);
    expect(migrated.scene.glow).toBe(2.2);
    expect(migrated.layers.length).toBeGreaterThan(0);
    expect(migrated.export.width).toBe(1280);
  });

  it('clamps corrupt numeric values and rejects future versions', () => {
    const recovered = migrateProject({ version: 2, scene: { ...DEFAULT_PROJECT.scene, symmetry: 999, primaryColor: 'broken' }, export: { width: 1279, height: -2, fps: 57 } });
    expect(recovered.scene.symmetry).toBe(24);
    expect(recovered.scene.primaryColor).toBe(DEFAULT_PROJECT.scene.primaryColor);
    expect(recovered.export.width % 2).toBe(0);
    expect(recovered.export.height).toBeGreaterThanOrEqual(256);
    expect(() => parseProject('{"version":99}')).toThrow(/supports up to/);
  });
});
