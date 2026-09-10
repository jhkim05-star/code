/** Device boundary: install a native storage/export bridge here later.
 * The browser implementation remains usable without any build step.
 */
import { BrowserStorage } from './storage.js';
export function storageAdapter(){return globalThis.ReadingPlatform?.storage || new BrowserStorage();}
export const nativeEnvironment=()=>!!globalThis.Capacitor?.isNativePlatform?.();
export async function exportFile(name,content,type='application/json'){
  if(globalThis.ReadingPlatform?.exportFile)return globalThis.ReadingPlatform.exportFile({name,content,type});
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  // Browser downloads cannot report that the user saved the file.
  return {requested:true,confirmed:false};
}
export async function shrinkCover(file){
  if(!file.type.startsWith('image/')||file.size>15000000)throw new Error('15MB 이하의 이미지 파일을 골라 주세요.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,480/img.width,720/img.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.8);
  }finally{URL.revokeObjectURL(url);}
}
