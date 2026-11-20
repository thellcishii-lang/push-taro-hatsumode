import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN } from './app-origin';
import { DEFAULT_STORAGE_BUCKET } from './storage-bucket';
import {
  VARIANT_APP_ORIGIN,
  VARIANT_DEFAULT_STORAGE_BUCKET,
  VARIANT_PROJECT_ID,
} from './variant-identity';

// バリアント識別ガード。
//
// このリポジトリは EVENT（push-taro-event）からのフォークで、公開 URL の
// 定数に EVENT 側の origin が残り、参拝者が EVENT アプリに飛ばされる事故が
// あった（2026-11-20）。同じ事故を「出荷前にテストで落とす」ための検査。
// 新しいバリアントをフォークしたら、まず lib/variant-identity.ts の
// プロジェクト ID を差し替えること（origin とバケットはそこから導出される）。

const OTHER_VARIANT_IDS = [
  'push-taro-event',
  'push-taro-machiokoshi',
  'push-taro-8b503',
] as const;

// 他バリアントの hosted.app サブドメイン断片（プロジェクト ID 本体でも
// 検出できるが、バックエンド ID だけが残るケースに備えて明示する）。
const OTHER_VARIANT_HOST_FRAGMENTS = [
  'push-taro-event--',
  'machiokoshi--push-taro-machiokoshi',
] as const;

const FORBIDDEN_TOKENS = [
  ...OTHER_VARIANT_IDS,
  ...OTHER_VARIANT_HOST_FRAGMENTS,
];

describe('バリアント識別ガード', () => {
  it('プロジェクト ID は初詣自身のもの', () => {
    expect(VARIANT_PROJECT_ID).toBe('push-taro-hatsumode');
  });

  it('APP_ORIGIN はプロジェクト ID から導出され、自バリアントのホストを指す', () => {
    expect(APP_ORIGIN).toBe(VARIANT_APP_ORIGIN);
    const host = new URL(APP_ORIGIN).host;
    expect(host.endsWith('--push-taro-hatsumode.asia-east1.hosted.app')).toBe(
      true,
    );
    for (const other of OTHER_VARIANT_IDS) {
      expect(APP_ORIGIN).not.toContain(other);
    }
  });

  it('既定の Storage バケットはプロジェクト ID から導出される', () => {
    expect(DEFAULT_STORAGE_BUCKET).toBe(VARIANT_DEFAULT_STORAGE_BUCKET);
    expect(DEFAULT_STORAGE_BUCKET).toBe(
      'push-taro-hatsumode.firebasestorage.app',
    );
  });

  it('lib/ app/ components/ のソースに他バリアントの識別子が残っていない', () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    // 識別子を定義するファイル自身は検査対象から外す（自バリアントの
    // プロジェクト ID を持つのが仕事であり、他バリアントの ID は持たない）。
    const definitionFiles = new Set([
      path.join(repoRoot, 'lib', 'variant-identity.ts'),
      path.join(repoRoot, 'lib', 'app-origin.ts'),
      path.join(repoRoot, 'lib', 'storage-bucket.ts'),
    ]);

    const sourceFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
          !entry.name.includes('.test.')
        ) {
          sourceFiles.push(full);
        }
      }
    };
    for (const dir of ['lib', 'app', 'components']) {
      walk(path.join(repoRoot, dir));
    }
    expect(sourceFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (definitionFiles.has(file)) continue;
      const content = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) {
          offenders.push(
            `${path.relative(repoRoot, file)} に "${token}" が残っています`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
