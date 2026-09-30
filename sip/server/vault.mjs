import{randomBytes,createCipheriv,createDecipheriv,createHash,timingSafeEqual}from'node:crypto';
import{readFile,writeFile,mkdir,rename}from'node:fs/promises';import{dirname}from'node:path';
export const token=()=>randomBytes(32).toString('base64url');
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function encrypt(data,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),ciphertext=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')});}
export function decrypt(raw,key){const e=JSON.parse(raw);if(e.v!==1)throw new Error('인증 저장소 형식을 확인해 주세요.');const d=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'));}
export class Vault{
 constructor(file,key){this.file=file;this.key=Buffer.from(key||'','base64');if(this.key.length!==32)throw new Error('SIP_MASTER_KEY는 base64 32바이트여야 합니다.');this.queue=Promise.resolve();}
 async load(){try{return decrypt(await readFile(this.file,'utf8'),this.key);}catch(e){if(e.code==='ENOENT')return {users:{},sessions:{},oauth:{}};throw new Error('인증 저장소를 읽지 못했습니다. 초기화하지 않았어요.');}}
 async transaction(fn){const run=this.queue.then(async()=>{const state=await this.load(),result=await fn(state);await mkdir(dirname(this.file),{recursive:true,mode:0o700});const tmp=this.file+'.'+token()+'.tmp';await writeFile(tmp,encrypt(state,this.key),{mode:0o600});await rename(tmp,this.file);return result;});this.queue=run.catch(()=>{});return run;}
}
