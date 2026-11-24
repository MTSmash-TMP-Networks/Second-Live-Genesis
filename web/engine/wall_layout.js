import WALLS from './wall_layout.json' with { type: 'json' };
export { WALLS };
export const REMOVED=4;
export function removedCells(cells=[]){return new Set(cells.filter(c=>c[2]>=REMOVED).map(c=>`${c[0]},${c[1]}`));}
export function cellBox(w,c,r){
  const p=[...w.p],s=[...w.s],a=w.axis;
  s[a]/=w.cols;s[1]/=w.rows;
  p[a]+=-w.s[a]/2+(c+.5)*s[a];p[1]+=-w.s[1]/2+(r+.5)*s[1];
  return {p,s};
}
// Group adjacent solid cells into horizontal runs. This is the same cell mask
// used by the renderer; physics and visuals therefore share openings.
export function solidRuns(w,cells=[]){
  const gone=removedCells(cells);if(!gone.size)return [{p:[...w.p],s:[...w.s]}];
  const out=[];
  for(let r=0;r<w.rows;r++)for(let c=0;c<w.cols;){
    if(gone.has(`${c},${r}`)){c++;continue;}
    const start=c;while(c<w.cols&&!gone.has(`${c},${r}`))c++;
    const first=cellBox(w,start,r),n=c-start,a=w.axis;
    first.p[a]+=(n-1)*first.s[a]/2;first.s[a]*=n;out.push(first);
  }
  return out;
}
export function wallSignature(cells=[]){return [...removedCells(cells)].sort().join(';');}
