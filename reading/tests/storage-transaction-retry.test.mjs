import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStorage, ConflictError } from '../assets/js/storage.js';

const closingError=()=>Object.assign(new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."),{name:'InvalidStateError'});

class FakeTransaction {
  constructor(data,stores,{fail=false}={}) {
    this.data=data;this.stores=Array.isArray(stores)?stores:[stores];this.pending=[];this.fail=fail;this.aborted=false;this.error=null;
    setTimeout(()=>this.finish(),0);
  }
  objectStore(name) {
    if(!this.stores.includes(name))throw new Error(`store ${name} not in transaction`);
    const map=this.data[name];
    return {
      get:key=>{const req={result:undefined,error:null};queueMicrotask(()=>{if(this.aborted)return;req.result=map.get(key);req.onsuccess?.();});return req;},
      getAll:()=>{const req={result:undefined,error:null};queueMicrotask(()=>{if(this.aborted)return;req.result=[...map.values()];req.onsuccess?.();});return req;},
      put:(value,key)=>{this.pending.push(()=>map.set(key,value));},
      delete:key=>{this.pending.push(()=>map.delete(key));},
      clear:()=>{this.pending.push(()=>map.clear());},
      openCursor:()=>({onsuccess:null}),
    };
  }
  abort(){if(this.aborted)return;this.aborted=true;queueMicrotask(()=>this.onabort?.());}
  finish(){
    if(this.aborted)return;
    if(this.fail){this.error=new Error('disk failed');this.onerror?.();return;}
    for(const apply of this.pending)apply();
    this.oncomplete?.();
  }
}

class FakeIndexedDB {
  constructor({state=null,outcomes=[]}={}) {
    this.data={kv:new Map(),drafts:new Map()};
    if(state)this.data.kv.set('state',state);
    this.outcomes=[...outcomes];this.openCount=0;this.connections=[];
  }
  open(){
    this.openCount++;
    const owner=this,req={result:null,error:null};
    const db={closed:false,objectStoreNames:{contains:name=>name==='kv'||name==='drafts'},close(){this.closed=true;},transaction(stores){
      const outcome=owner.outcomes.shift();
      if(outcome instanceof Error)throw outcome;
      return new FakeTransaction(owner.data,stores,{fail:outcome==='fail'});
    }};
    this.connections.push(db);
    queueMicrotask(()=>{req.result=db;req.onsuccess?.();});
    return req;
  }
}

test('get reopens once when the first transaction sees a closing connection',async()=>{
  const idb=new FakeIndexedDB({state:{revision:3,books:[{id:'kept'}]},outcomes:[closingError(),null]});
  const storage=new BrowserStorage({indexedDB:idb,localStorage:null});
  assert.deepEqual(await storage.load(),{revision:3,books:[{id:'kept'}]});
  assert.equal(idb.openCount,2);
  assert.equal(idb.connections[0].closed,true);
});

test('save reopens once and preserves the revision check before writing',async()=>{
  const current={revision:1,books:[{id:'old'}]},next={revision:2,books:[{id:'old'},{id:'new'}]};
  const idb=new FakeIndexedDB({state:current,outcomes:[closingError(),null]});
  const storage=new BrowserStorage({indexedDB:idb,localStorage:null});
  await storage.save(next,1);
  assert.deepEqual(idb.data.kv.get('state'),next);
  assert.equal(idb.openCount,2);
});

test('a real failure after the single reconnect is surfaced without replacing state',async()=>{
  const current={revision:4,books:[{id:'original'}]},next={revision:5,books:[]};
  const idb=new FakeIndexedDB({state:current,outcomes:[closingError(),'fail']});
  const storage=new BrowserStorage({indexedDB:idb,localStorage:null});
  await assert.rejects(storage.save(next,4),/disk failed/);
  assert.deepEqual(idb.data.kv.get('state'),current);
  assert.equal(idb.openCount,2);
});

test('ConflictError remains a data conflict and never reconnects',async()=>{
  const current={revision:7,books:[{id:'other-tab'}]},next={revision:8,books:[{id:'mine'}]};
  const idb=new FakeIndexedDB({state:current,outcomes:[null]});
  const storage=new BrowserStorage({indexedDB:idb,localStorage:null});
  await assert.rejects(storage.save(next,6),error=>error instanceof ConflictError);
  assert.deepEqual(idb.data.kv.get('state'),current);
  assert.equal(idb.openCount,1);
});

test('draft writes and reads share the same one-shot reconnect and versionchange lifecycle',async()=>{
  const messageOnly=Object.assign(new Error('The database connection is closing.'),{name:'UnknownError'});
  const idb=new FakeIndexedDB({outcomes:[messageOnly,null]});
  const storage=new BrowserStorage({indexedDB:idb,localStorage:null});
  await storage.draftPut('draft-1',{text:'입력 유지'});
  assert.equal(idb.openCount,2);
  idb.outcomes.push(closingError(),null);
  assert.deepEqual(await storage.drafts(),[{text:'입력 유지'}]);
  assert.equal(idb.openCount,3);
  const active=storage.db;
  active.onversionchange();
  assert.equal(active.closed,true);
  assert.equal(storage.db,null);
  assert.deepEqual(await storage.draftGet('draft-1'),{text:'입력 유지'});
  assert.equal(idb.openCount,4);
});
