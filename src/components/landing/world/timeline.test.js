import { worldWeights, signalPoint, WORLD_STOPS } from './timeline';

test('ribbon morphs retain normalized weights and exact end shapes', () => {
  WORLD_STOPS.forEach((stop, index) => {
    const weights = worldWeights(stop);
    expect(weights[index]).toBeCloseTo(1);
  });
  for (let i = -10; i <= 110; i++) {
    const weights = worldWeights(i / 100);
    expect(weights.reduce((a,b) => a+b,0)).toBeCloseTo(1);
    weights.forEach(weight => expect(weight).toBeGreaterThanOrEqual(0));
  }
});
test('scrolling across scene boundaries remains continuous and reversible', () => {
  WORLD_STOPS.forEach(stop => {
    const a=worldWeights(stop-.00001), b=worldWeights(stop+.00001);
    a.forEach((weight,index)=>expect(Math.abs(weight-b[index])).toBeLessThan(.001));
  });
  const forward = Array.from({length:101},(_,i)=>worldWeights(i/100));
  const reverse = Array.from({length:101},(_,i)=>worldWeights(1-i/100)).reverse();
  forward.forEach((weights,i)=>weights.forEach((weight,j)=>expect(weight).toBeCloseTo(reverse[i][j])));
});
test('all ribbon lanes have finite positions throughout every shape', () => {
  for(let stage=0;stage<4;stage++) for(let lane=0;lane<5;lane++) for(let i=0;i<=180;i++) {
    signalPoint(stage,i/180*Math.PI*2,lane).forEach(coordinate=>{
      expect(Number.isFinite(coordinate)).toBe(true);
      expect(Math.abs(coordinate)).toBeLessThan(5);
    });
  }
});
