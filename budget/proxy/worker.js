const json=(value,status=200,origin='')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json;charset=UTF-8','Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store'}});
export default{
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'',allowed=String(env.ALLOWED_ORIGIN||'').split(',').map(v=>v.trim()).filter(Boolean);
    if(!allowed.includes(origin))return json({error:'origin_not_allowed'},403,'null');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Client-Token','Access-Control-Max-Age':'86400','Vary':'Origin'}});
    if(new URL(request.url).pathname!=='/notion/query'||request.method!=='POST')return json({error:'not_found'},404,origin);
    if(!env.NOTION_TOKEN||!env.CLIENT_TOKEN||request.headers.get('X-Client-Token')!==env.CLIENT_TOKEN)return json({error:'unauthorized'},401,origin);
    let body;try{body=await request.json();}catch{return json({error:'invalid_json'},400,origin);}
    if(!/^[0-9a-f-]{32,36}$/i.test(body.dataSourceId||''))return json({error:'invalid_data_source_id'},400,origin);
    const payload={page_size:Math.min(100,Math.max(1,Number(body.pageSize)||100)),sorts:[{timestamp:'last_edited_time',direction:'descending'}]};
    if(body.startCursor)payload.start_cursor=body.startCursor;
    if(body.lastSync)payload.filter={timestamp:'last_edited_time',last_edited_time:{on_or_after:body.lastSync}};
    const notion=await fetch(`https://api.notion.com/v1/data_sources/${body.dataSourceId}/query`,{method:'POST',headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await notion.json();if(!notion.ok)return json({error:'notion_error',status:notion.status,message:data.message||'Notion request failed'},notion.status,origin);
    return json(data,200,origin);
  }
};
