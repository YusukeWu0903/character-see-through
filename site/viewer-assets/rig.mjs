// Rest-canvas affine transforms; draw order is independent of hierarchy.
export const identity = () => [1, 0, 0, 1, 0, 0];
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : 0));
export function validateRig(rig) {
  if (rig.schemaVersion !== 1 || !Array.isArray(rig.nodes) || !rig.bindings)
    throw new Error('Unsupported rig schema');
  const nodes = new Map();
  for (const n of rig.nodes) {
    if (!n.id || nodes.has(n.id) || !Array.isArray(n.pivot) || n.pivot.length !== 2 ||
        !n.pivot.every(Number.isFinite) || !['none','body','torso','head','hair'].includes(n.motion) ||
        !Number.isFinite(n.maxDegrees) || n.maxDegrees < 0 || n.maxDegrees > 10 ||
        !Number.isFinite(n.phase)) throw new Error('Invalid or duplicate node');
    nodes.set(n.id, n);
  }
  if (rig.nodes.filter(n => n.parent === null).length !== 1) throw new Error('Expected one root');
  const visited = new Set(), active = new Set(), ordered = [];
  function visit(id) {
    if (active.has(id)) throw new Error('Hierarchy cycle');
    if (visited.has(id)) return;
    const n = nodes.get(id);
    if (!n) throw new Error('Missing parent');
    active.add(id);
    if (n.parent !== null) visit(n.parent);
    active.delete(id); visited.add(id); ordered.push(n);
  }
  nodes.forEach(n => visit(n.id));
  for (const id of Object.values(rig.bindings)) if (!nodes.has(id)) throw new Error('Missing binding node');
  return ordered;
}
export function createRig(rig) {
  const ordered = validateRig(rig);
  return function evaluate(controls = {}, time = 0) {
    const t = Number.isFinite(time) ? time : 0;
    const body = clamp(controls.body, -1, 1), head = clamp(controls.head, -1, 1);
    const torso = clamp(controls.torso, -1, 1);
    const breath = clamp(controls.breath, 0, 1), hair = clamp(controls.hair, 0, 1);
    const world = new Map();
    for (const n of ordered) {
      let angle = 0, dy = 0;
      if (n.motion === 'body') { angle = body*n.maxDegrees; dy = Math.sin(t*1.4)*breath*0.004; }
      if (n.motion === 'head') angle = head*n.maxDegrees;
      if (n.motion === 'torso') angle = torso*n.maxDegrees;
      if (n.motion === 'hair') angle = Math.sin(t*0.8+n.phase)*hair*n.maxDegrees;
      const rad = angle*Math.PI/180, c = Math.cos(rad), s = Math.sin(rad);
      const [x,y] = n.pivot;
      const local = [c,s,-s,c,x-c*x+s*y,y+dy-s*x-c*y];
      world.set(n.id, multiply(n.parent === null ? identity() : world.get(n.parent), local));
    }
    return Object.fromEntries(Object.entries(rig.bindings).map(([layer,id]) => [layer, world.get(id).slice()]));
  };
}
