const cursorOf=text=>{let h=0;for(const c of text)h=(Math.imul(h,31)+c.charCodeAt(0))|0;return `web:${(h>>>0).toString(36)}`;};
export class FinancialNotificationAdapter{async listFinancialNotifications(){throw new Error('플랫폼 어댑터가 연결되지 않았어요.');}}
export class WebNotificationAdapter extends FinancialNotificationAdapter{
  constructor(getText=()=>'',getFiles=()=>[]){super();this.getText=getText;this.getFiles=getFiles;}
  async listFinancialNotifications(sinceCursor){
    const fileTexts=await Promise.all([...this.getFiles()].map(file=>file.text())),shared=await consumeSharedText();
    const raw=[this.getText(),...fileTexts,shared].filter(Boolean).join('\n\n'),blocks=raw.split(/\n{2,}|(?=\[(?:카카오톡|Web발신)\])/).map(v=>v.trim()).filter(Boolean),cursor=cursorOf(raw);
    return {items:sinceCursor===cursor?[]:blocks.map((text,index)=>({id:`${cursor}:${index}`,text,source:fileTexts.length?'import':'paste'})),cursor};
  }
}
async function consumeSharedText(){if(!globalThis.caches||!globalThis.location)return'';const inbox=await caches.open('budget-share-inbox-v1'),request=new Request(new URL('./__shared_notification__',location.href)),response=await inbox.match(request);if(!response)return'';const text=await response.text();await inbox.delete(request);return text;}
/** Android bridge contract. A Capacitor plugin should expose exactly this method after NotificationListenerService permission is granted. */
export class AndroidNotificationAdapter extends FinancialNotificationAdapter{
  constructor(bridge=globalThis.Capacitor?.Plugins?.FinancialNotifications){super();this.bridge=bridge;}
  async listFinancialNotifications(sinceCursor){if(!this.bridge?.listFinancialNotifications)throw new Error('Android 알림 접근 어댑터가 연결되지 않았어요.');return this.bridge.listFinancialNotifications({sinceCursor});}
}
export function platformAdapter(web){return globalThis.Capacitor?.getPlatform?.()==='android'?new AndroidNotificationAdapter():web;}
