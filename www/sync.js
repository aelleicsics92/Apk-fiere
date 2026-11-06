(function(root){
function create(env){
  let running=false;
  const enc=encodeURIComponent;
  const hdr=(c,x)=>Object.assign({apikey:c.key,'x-fiere-key':c.app,'Content-Type':'application/json'},/^eyJ/.test(c.key)?{Authorization:'Bearer '+c.key}:{},x||{});
  async function call(c,method,path,body,extra){
    const r=await env.http(method,c.url.replace(/\/+$/,'')+'/rest/v1/'+path,hdr(c,extra),body);
    if(r.status<200||r.status>=300)throw new Error('HTTP '+r.status+' '+String(r.text||'').slice(0,120));
    return r.json;
  }
  async function push(c){
    const S=env.state();
    const ids=Object.keys(S.dirty);
    for(let i=0;i<ids.length;i+=100){
      const rows=[],sent={},sales=env.getSales();
      ids.slice(i,i+100).forEach(id=>{
        const d=S.dirty[id];if(!d)return;
        if(d.t==='d'){rows.push({id,data:{u:d.u},deleted:true});sent[id]=d.u}
        else{const s=sales.find(x=>x.id===id);if(s){rows.push({id,data:{ts:s.ts,pay:s.pay,items:s.items,u:s.u},deleted:false});sent[id]=d.u}else delete S.dirty[id]}
      });
      if(rows.length)await call(c,'POST','fiere_sales?on_conflict=id',rows,{Prefer:'resolution=merge-duplicates,return=minimal'});
      Object.keys(sent).forEach(id=>{if(S.dirty[id]&&S.dirty[id].u===sent[id])delete S.dirty[id]});
      env.persist();
    }
    if(S.invAll){
      const inv=env.getInv();
      ['comp','conto'].forEach(sec=>inv[sec].items.forEach(i=>S.invQ.push({sec,code:i.c,name:i.n,price:i.p})));
      S.invAll=false;env.persist();
    }
    while(S.invQ.length){
      const b=S.invQ.slice(0,300);
      await call(c,'POST','fiere_inventory?on_conflict=sec,code',b,{Prefer:'resolution=ignore-duplicates,return=minimal'});
      S.invQ.splice(0,b.length);env.persist();
    }
  }
  async function pull(c){
    const S=env.state();let cs=false,ci=false,max=S.lastSales;
    for(let o=0;;o+=1000){
      const rows=await call(c,'GET','fiere_sales?select=id,data,deleted,synced_at&synced_at=gte.'+enc(S.lastSales)+'&order=synced_at.asc,id.asc&limit=1000&offset='+o);
      const sales=env.getSales();
      rows.forEach(r=>{
        if(r.synced_at>max)max=r.synced_at;
        const ru=(r.data&&r.data.u)||0,d=S.dirty[r.id];
        if(d&&d.u>ru)return;
        const idx=sales.findIndex(x=>x.id===r.id);
        if(r.deleted){if(idx>=0){sales.splice(idx,1);cs=true}return}
        if(!r.data||!r.data.items)return;
        const ns={id:r.id,ts:r.data.ts,pay:r.data.pay,items:r.data.items,u:ru};
        if(idx<0){sales.push(ns);cs=true}else if(ru>(sales[idx].u||0)){sales[idx]=ns;cs=true}
      });
      env.setSales(sales);
      if(rows.length<1000)break;
    }
    S.lastSales=max;
    const inv=env.getInv(),sets={comp:new Set(inv.comp.items.map(i=>i.c)),conto:new Set(inv.conto.items.map(i=>i.c))};
    let mi=S.lastInv;
    for(let o=0;;o+=1000){
      const rows=await call(c,'GET','fiere_inventory?select=sec,code,name,price,synced_at&synced_at=gte.'+enc(S.lastInv)+'&order=synced_at.asc,sec.asc,code.asc&limit=1000&offset='+o);
      rows.forEach(r=>{
        if(r.synced_at>mi)mi=r.synced_at;
        const set=sets[r.sec];if(!set||set.has(r.code))return;
        set.add(r.code);inv[r.sec].items.push({c:r.code,n:r.name,p:Number(r.price)});inv[r.sec].upd=new Date().toISOString();ci=true;
      });
      if(rows.length<1000)break;
    }
    S.lastInv=mi;
    return {sales:cs,inv:ci};
  }
  async function run(){
    const c=env.cfg();
    if(!c||running)return {skipped:true};
    running=true;env.status('busy');
    try{await push(c);const ch=await pull(c);env.persist();env.status('ok');if(ch.sales||ch.inv)env.changed(ch);return {ok:true}}
    catch(e){env.status('err',e&&e.message||String(e));return {ok:false,error:String(e&&e.message||e)}}
    finally{running=false}
  }
  return {run};
}
root.FSync={create};
if(typeof module!=='undefined')module.exports=root.FSync;
})(typeof window!=='undefined'?window:globalThis);
