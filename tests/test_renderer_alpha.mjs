import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('premultiplied texture fades scale RGB together with alpha', async () => {
  const source = await readFile(new URL('../viewer/mesh-renderer.mjs', import.meta.url), 'utf8');
  assert.match(source, /c\.rgb\*=opacity;c\.a\*=opacity/);
  assert.match(source, /gl\.blendFunc\(gl\.ONE,gl\.ONE_MINUS_SRC_ALPHA\)/);
  assert.match(source, /openEyelash/);
  assert.match(source, /eyePart\|\|openEyelash\?1-blink/);
  assert.match(source, /chestLobes/);
  assert.match(source, /bustLocal/);
  assert.match(source, /chestAmplitude/);
});
