/** Cover photos are display thumbnails. Visit album uploads keep their originals. */
export async function prepareCover(file: File): Promise<Blob> {
  const extension=file.name.split('.').pop()?.toLowerCase();
  if (!['jpg','jpeg','png','webp','heic','heif'].includes(extension || '') || file.size<1 || file.size>25*1024*1024) {
    throw new Error('Choose a JPEG, PNG, WebP or HEIC image under 25 MB');
  }
  let source: Blob=file;
  if (extension==='heic' || extension==='heif') {
    const {default:heic2any}=await import('heic2any');
    const converted=await heic2any({blob:file,toType:'image/jpeg',quality:.86});
    source=Array.isArray(converted)?converted[0]:converted;
  }
  const objectUrl=URL.createObjectURL(source);
  try {
    const image=new Image();
    image.src=objectUrl;
    await image.decode();
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable on this device');
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image conversion failed')),'image/jpeg',.82));
    if (result.size>5*1024*1024) throw new Error('Cover image must be 5 MB or less after conversion');
    return result;
  } finally { URL.revokeObjectURL(objectUrl); }
}
