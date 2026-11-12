import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {require} from './common.mjs';
const {PNG}=require('pngjs');
export function populatedBody(image){
  const colors=new Set();let minimum=255,maximum=0;
  for(let y=80;y<Math.min(650,image.height-40);y+=8)
    for(let x=100;x<image.width-330;x+=8){
      const offset=(y*image.width+x)*4;
      const r=image.data[offset],g=image.data[offset+1],b=image.data[offset+2];
      const luminance=(r+g+b)/3;
      minimum=Math.min(minimum,luminance);maximum=Math.max(maximum,luminance);
      colors.add(`${r},${g},${b}`);
    }
  assert.ok(colors.size>16&&maximum-minimum>40,'Native capture body is blank or unpopulated');
  return {colors:colors.size,luminanceRange:maximum-minimum};
}
export async function imageProof(path,height=900){
  const image=PNG.sync.read(await readFile(path));
  assert.equal(image.width,1440);assert.equal(image.height,height);
  return {width:image.width,height:image.height,...populatedBody(image)};
}
// Negative control: a black native surface cannot validate a memory saving.
assert.throws(()=>populatedBody({width:1440,height:900,data:Buffer.alloc(1440*900*4)}));
