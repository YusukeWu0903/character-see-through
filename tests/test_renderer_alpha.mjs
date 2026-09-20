import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {eyeSide,selectEyeMask} from '../viewer/mesh-renderer.mjs';

test('premultiplied texture fades scale RGB together with alpha', async () => {
  const source = await readFile(new URL('../viewer/mesh-renderer.mjs', import.meta.url), 'utf8');
  assert.match(source, /c\.rgb\*=opacity;c\.a\*=opacity/);
  assert.match(source, /texture2D\(eyeMask,uv\+eyeOffset\*\.5\)\.a/);
  assert.match(source, /c\.rgb\*=mask;c\.a\*=mask/);
  assert.match(source, /gl\.blendFunc\(gl\.ONE,gl\.ONE_MINUS_SRC_ALPHA\)/);
  assert.match(source, /texture\(eyeMask\|\|image\)/);
  assert.match(source, /maxUpload=768/);
  assert.match(source, /drawImage\(image,0,0,reduced\.width,reduced\.height\)/);
  assert.match(source, /source\.width=1;source\.height=1/);
  assert.match(source, /openEyelash/);
  assert.match(source, /openOpacity/);
  assert.match(source, /separate oscillation/);
  assert.match(source, /'handwear','seam_repair_torso'/);
  assert.match(source, /lock the\r?\n        \/\/ complete head group to the torso/);
});
test('each split iris selects only its matching eyewhite alpha mask',()=>{
  const left={},right={},combined={};
  const layers=[{name:'eyewhite',image:combined},{name:'eyewhite_left',image:left},{name:'eyewhite_right',image:right}];
  assert.equal(eyeSide('irides_left'),'left');
  assert.equal(eyeSide('irides_right'),'right');
  assert.equal(selectEyeMask(layers,'irides_left'),left);
  assert.equal(selectEyeMask(layers,'irides_right'),right);
});
