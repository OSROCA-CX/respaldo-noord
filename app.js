const SUPABASE_URL='https://shtndxvlocypcmwuuskq.supabase.co';
const SUPABASE_KEY='sb_publishable_xQdMri0JakqKeKGcM-Hmwg_uRx8Rz7y';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let owners={},searchTimer=null,mode='contacts',dealView='board',page=0;
const PER=100;
const STAGES=[['23073047','Presentación agendada'],['23073048','Cotización enviada'],['23073049','Revisión de crédito'],['23073050','Apartada'],['23073052','Contrato firmado'],['23919393','Escritura firmada'],['23100254','Cierre perdido']];
const stageMap=Object.fromEntries(STAGES);
const LIFECYCLE=[['subscriber','Suscriptor'],['lead','Lead'],['marketingqualifiedlead','MQL'],['salesqualifiedlead','SQL'],['opportunity','Oportunidad'],['customer','Cliente'],['evangelist','Evangelista'],['other','Otro']];
const PRODUCTOS=['CINCO Park','Ipana','Macora 86','Madero 54','Palta 152','Zensia'];
const CANALES=['Activaciones','Base de datos','BBVA','Casas y Terrenos','Espectaculares','Facebook','Geomarketing','Google Adwords','Inmobiliarias','Inmuebles 24','Instagram','Landing Page','Linkedin','Mailing Noord','Portal Inmobiliario','Programa de referidos','Recomendado','Referidos','Simulador','Sitio web','TikTok','Visitó la zona','Vivanuncios','Whatsapp'];
let filters={contacts:{logic:'AND',rows:[]},deals:{logic:'AND',rows:[]}};

const FIELDS={
  contacts:[
    {key:'lifecyclestage',label:'Etapa del lead',type:'select',options:LIFECYCLE},
    {key:'owner_id',label:'Asesor',type:'owner'},
    {key:'producto',label:'Producto',type:'select',options:PRODUCTOS.map(p=>[p,p])},
    {key:'canal',label:'Canal',type:'select',options:CANALES.map(c=>[c,c])},
    {key:'createdate',label:'Fecha de creación',type:'date'}
  ],
  deals:[
    {key:'dealstage',label:'Etapa del negocio',type:'select',options:STAGES},
    {key:'owner_id',label:'Asesor',type:'owner'},
    {key:'producto',label:'Desarrollo/Producto',type:'select',options:PRODUCTOS.map(p=>[p,p])},
    {key:'canal',label:'Canal',type:'select',options:CANALES.map(c=>[c,c])},
    {key:'gerente_desarrollo',label:'Gerente',type:'owner'},
    {key:'createdate',label:'Fecha de creación',type:'date'},
    {key:'closedate',label:'Fecha de cierre',type:'date'}
  ]
};

function fmt(ts){if(!ts)return '';try{const d=new Date(ts);if(isNaN(d))return '';return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}catch(e){return ''}}
function fmtT(ts){if(!ts)return '';try{return new Date(ts).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function initials(f,l){return (((f||'')[0]||'')+((l||'')[0]||'')).toUpperCase()}
function stageBadge(s){const m={salesqualifiedlead:['SQL','badge-sql'],opportunity:['Oport','badge-opp'],customer:['Cliente','badge-customer'],lead:['Lead','badge-lead'],marketingqualifiedlead:['MQL','badge-lead']};const[lb,c]=m[s]||['','badge-lead'];return lb?`<span class="badge ${c}">${lb}</span>`:''}
function ownerName(id){return owners[id]?`${owners[id].first_name||''} ${owners[id].last_name||''}`.trim():(id?`Asesor ${id}`:'Sin asignar')}
function clean(t){return (t||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}
function esc(t){return (t||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

async function doLogin(){
  const email=document.getElementById('email').value.trim(),password=document.getElementById('password').value;
  const btn=document.getElementById('loginBtn'),err=document.getElementById('loginError');err.classList.remove('visible');
  if(!email||!password){err.textContent='Escribe correo y contraseña.';err.classList.add('visible');return}
  btn.disabled=true;btn.textContent='Entrando...';
  const{error}=await sb.auth.signInWithPassword({email,password});
  if(error){err.textContent='Correo o contraseña incorrectos.';err.classList.add('visible');btn.disabled=false;btn.textContent='Entrar';return}
  await startApp();
}
async function doLogout(){await sb.auth.signOut();location.reload()}
async function startApp(){
  document.getElementById('loginView').style.display='none';
  document.getElementById('appView').style.display='block';
  const{data}=await sb.from('owners').select('*');if(data)data.forEach(o=>{owners[String(o.id)]=o});
  setMode('contacts');
}

function setMode(m){
  mode=m;page=0;
  document.getElementById('mode-contacts').classList.toggle('active',m==='contacts');
  document.getElementById('mode-deals').classList.toggle('active',m==='deals');
  document.getElementById('detailPanel').classList.remove('visible');
  document.getElementById('searchInput').value='';
  document.getElementById('searchInput').placeholder=m==='contacts'?'Buscar contacto...':'Buscar negocio...';
  document.getElementById('viewSwitch').style.display=m==='deals'?'flex':'none';
  document.getElementById('filterPanel').classList.remove('visible');
  renderFilterBtn();
  if(m==='deals'&&dealView==='board')renderBoard();else browse();
}
function setDealView(v){
  dealView=v;page=0;
  document.getElementById('view-board').classList.toggle('active',v==='board');
  document.getElementById('view-list').classList.toggle('active',v==='list');
  document.getElementById('detailPanel').classList.remove('visible');
  if(v==='board')renderBoard();else browse();
}

// ===== FILTROS =====
function toggleFilters(){
  const p=document.getElementById('filterPanel');
  if(p.classList.contains('visible')){p.classList.remove('visible');return}
  renderFilterPanel();p.classList.add('visible');
}
function renderFilterPanel(){
  const f=filters[mode],flds=FIELDS[mode];
  let rowsH=f.rows.map((r,i)=>filterRowHtml(r,i,flds)).join('');
  document.getElementById('filterPanel').innerHTML=`
    <h3><i class="ti ti-filter"></i> Filtros de ${mode==='contacts'?'contactos':'negocios'}</h3>
    <div class="logic-switch">
      <span class="logic-opt ${f.logic==='AND'?'active':''}" onclick="setLogic('AND')">Cumplir TODOS (Y)</span>
      <span class="logic-opt ${f.logic==='OR'?'active':''}" onclick="setLogic('OR')">Cumplir CUALQUIERA (O)</span>
    </div>
    <div id="filterRows">${rowsH||'<div style="font-size:13px;color:var(--text-3);margin-bottom:8px">Sin filtros. Agrega uno abajo.</div>'}</div>
    <div class="filter-actions">
      <button class="btn-add" onclick="addFilterRow()"><i class="ti ti-plus" style="vertical-align:-2px"></i> Agregar filtro</button>
      <button class="btn-apply" onclick="applyFilters()">Aplicar</button>
      <button class="btn-clear" onclick="clearFilters()">Limpiar todo</button>
    </div>`;
}
function filterRowHtml(r,i,flds){
  const fldOpts=flds.map(f=>`<option value="${f.key}" ${r.field===f.key?'selected':''}>${f.label}</option>`).join('');
  const fld=flds.find(f=>f.key===r.field)||flds[0];
  let valInput='';
  if(fld.type==='select'){valInput=`<select onchange="updateRow(${i},'value',this.value)"><option value="">— elige —</option>${fld.options.map(o=>`<option value="${o[0]}" ${r.value===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`;}
  else if(fld.type==='owner'){const os=Object.values(owners).map(o=>[String(o.id),`${o.first_name||''} ${o.last_name||''}`.trim()]).sort((a,b)=>a[1].localeCompare(b[1]));valInput=`<select onchange="updateRow(${i},'value',this.value)"><option value="">— elige —</option>${os.map(o=>`<option value="${o[0]}" ${r.value===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`;}
  else if(fld.type==='date'){valInput=`<input type="date" value="${r.value||''}" onchange="updateRow(${i},'value',this.value)"> <select onchange="updateRow(${i},'op',this.value)"><option value="gte" ${r.op==='gte'?'selected':''}>desde</option><option value="lte" ${r.op==='lte'?'selected':''}>hasta</option></select>`;}
  return `<div class="filter-row"><select class="filter-field" onchange="updateRow(${i},'field',this.value)">${fldOpts}</select>${valInput}<button class="filter-rm" onclick="rmFilterRow(${i})"><i class="ti ti-x"></i></button></div>`;
}
function setLogic(l){filters[mode].logic=l;renderFilterPanel()}
function addFilterRow(){filters[mode].rows.push({field:FIELDS[mode][0].key,value:'',op:'gte'});renderFilterPanel()}
function rmFilterRow(i){filters[mode].rows.splice(i,1);renderFilterPanel()}
function updateRow(i,k,v){filters[mode].rows[i][k]=v;if(k==='field')filters[mode].rows[i].value='';renderFilterPanel()}
function clearFilters(){filters[mode]={logic:'AND',rows:[]};renderFilterPanel();renderFilterBtn();page=0;if(mode==='deals'&&dealView==='board')renderBoard();else browse()}
function applyFilters(){document.getElementById('filterPanel').classList.remove('visible');renderFilterBtn();page=0;if(mode==='deals'&&dealView==='board')renderBoard();else browse()}
function renderFilterBtn(){
  const n=filters[mode].rows.filter(r=>r.value).length,btn=document.getElementById('filterBtn'),c=document.getElementById('filterCount');
  if(n>0){btn.classList.add('has-filters');c.style.display='inline-block';c.textContent=n}else{btn.classList.remove('has-filters');c.style.display='none'}
}
function activeRows(){return filters[mode].rows.filter(r=>r.value)}

// Aplica filtros a una query de Supabase
function applyToQuery(query){
  const rows=activeRows(),logic=filters[mode].logic;
  if(rows.length===0)return query;
  if(logic==='AND'){
    rows.forEach(r=>{
      const fld=FIELDS[mode].find(f=>f.key===r.field);
      if(fld.type==='date'){if(r.op==='gte')query=query.gte(r.field,r.value);else query=query.lte(r.field,r.value);}
      else query=query.eq(r.field,r.value);
    });
  }else{
    const ors=rows.map(r=>{
      const fld=FIELDS[mode].find(f=>f.key===r.field);
      if(fld.type==='date'){return `${r.field}.${r.op==='gte'?'gte':'lte'}.${r.value}`;}
      return `${r.field}.eq.${r.value}`;
    });
    query=query.or(ors.join(','));
  }
  return query;
}

// ===== BROWSE =====
async function browse(){
  document.getElementById('boardView').style.display='none';
  document.getElementById('resultsList').style.display='block';
  const info=document.getElementById('resultsInfo'),list=document.getElementById('resultsList');
  info.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Cargando...';
  const from=page*PER,to=from+PER-1;
  const tabla=mode==='contacts'?'contacts':'deals';
  let query=sb.from(tabla).select('*',{count:'exact'});
  query=applyToQuery(query);
  query=query.order('createdate',{ascending:false}).range(from,to);
  const{data,count,error}=await query;
  if(error){info.textContent='Error: '+error.message;return}
  if(mode==='contacts')renderContacts(data||[]);else renderDeals(data||[]);
  const nf=activeRows().length;
  info.textContent=`${(count||0).toLocaleString('es-MX')} ${mode==='contacts'?'contactos':'negocios'}${nf?' (filtrados)':''} · página ${page+1}`;
  renderPager(count||0);
}
function renderPager(total){
  const pages=Math.max(1,Math.ceil(total/PER)),p=document.getElementById('pager');
  p.style.display='flex';
  p.innerHTML=`<button onclick="page=Math.max(0,page-1);browse()" ${page===0?'disabled':''}>← Anterior</button><span>Página ${page+1} de ${pages.toLocaleString('es-MX')}</span><button onclick="page=Math.min(${pages-1},page+1);browse()" ${page>=pages-1?'disabled':''}>Siguiente →</button>`;
}
function renderContacts(rows){
  document.getElementById('resultsList').innerHTML=rows.map(c=>{const ini=initials(c.firstname,c.lastname),nm=`${c.firstname||''} ${c.lastname||''}`.trim()||'Sin nombre';return `<div class="card" onclick="showContact('${c.id}')"><div class="card-h"><div class="avatar">${ini||'?'}</div><div style="flex:1;min-width:0"><div class="card-name">${nm}${stageBadge(c.lifecyclestage)}</div><div class="card-meta">${c.email||'Sin email'} · ${c.phone||c.mobilephone||'Sin tel'}${c.producto?'<span class="tag">'+c.producto+'</span>':''}</div><div class="owner-chip"><i class="ti ti-user"></i> ${ownerName(c.owner_id)}</div></div><i class="ti ti-chevron-right" style="font-size:18px;color:var(--text-3)"></i></div></div>`}).join('')||'<div class="empty">Sin resultados</div>';
}
function renderDeals(rows){
  document.getElementById('resultsList').innerHTML=rows.map(d=>`<div class="card" onclick="showDeal('${d.id}')"><div class="card-h"><div class="avatar"><i class="ti ti-briefcase" style="font-size:18px"></i></div><div style="flex:1;min-width:0"><div class="card-name">${d.dealname||'Sin nombre'}</div><div class="card-meta">${d.amount?'$'+Number(d.amount).toLocaleString('es-MX'):'Sin monto'} · <span class="st">${stageMap[d.dealstage]||d.dealstage}</span>${d.producto?'<span class="tag">'+d.producto+'</span>':''}</div><div class="owner-chip"><i class="ti ti-user"></i> ${ownerName(d.owner_id)}${d.canal?' · '+d.canal:''}</div></div><i class="ti ti-chevron-right" style="font-size:18px;color:var(--text-3)"></i></div></div>`).join('')||'<div class="empty">Sin resultados</div>';
}

// ===== TABLERO =====
const boardState={};
async function renderBoard(){
  document.getElementById('resultsList').style.display='none';
  document.getElementById('pager').style.display='none';
  const bv=document.getElementById('boardView');bv.style.display='block';
  const nf=activeRows().length;
  document.getElementById('resultsInfo').textContent='Tablero por etapa'+(nf?' (con filtros aplicados)':'')+' — desliza cada columna para ver más';
  bv.innerHTML='<div class="board" id="board"></div>';
  const board=document.getElementById('board');
  for(const [sid,sname] of STAGES){
    boardState[sid]={offset:0,done:false,loading:false};
    let cq=sb.from('deals').select('id',{count:'exact',head:true}).eq('dealstage',sid);
    cq=applyBoardFilters(cq);
    const{count}=await cq;
    const col=document.createElement('div');col.className='col';
    col.innerHTML=`<div class="col-h">${sname}<span class="col-count">${(count||0).toLocaleString('es-MX')}</span></div><div class="col-body" id="col-${sid}"></div>`;
    board.appendChild(col);
    const body=col.querySelector('.col-body');
    body.addEventListener('scroll',()=>{if(body.scrollTop+body.clientHeight>=body.scrollHeight-40)loadColumn(sid)});
    await loadColumn(sid);
  }
}
function applyBoardFilters(query){
  // En tablero, los filtros de etapa se ignoran (ya agrupa por etapa); aplica los demás con AND
  const rows=activeRows().filter(r=>r.field!=='dealstage');
  rows.forEach(r=>{
    const fld=FIELDS.deals.find(f=>f.key===r.field);
    if(fld.type==='date'){if(r.op==='gte')query=query.gte(r.field,r.value);else query=query.lte(r.field,r.value);}
    else query=query.eq(r.field,r.value);
  });
  return query;
}
async function loadColumn(sid){
  const s=boardState[sid];if(s.done||s.loading)return;s.loading=true;
  const body=document.getElementById('col-'+sid);
  let q=sb.from('deals').select('*').eq('dealstage',sid);
  q=applyBoardFilters(q);
  q=q.order('createdate',{ascending:false}).range(s.offset,s.offset+19);
  const{data}=await q;
  if(!data||data.length<20)s.done=true;
  s.offset+=20;s.loading=false;
  (data||[]).forEach(d=>{const el=document.createElement('div');el.className='deal-mini';el.onclick=()=>showDeal(d.id);el.innerHTML=`<div class="deal-mini-name">${d.dealname||'Sin nombre'}</div><div class="deal-mini-meta">${d.amount?'$'+Number(d.amount).toLocaleString('es-MX'):'Sin monto'}<br>${d.producto||''}<br>${ownerName(d.owner_id)}<br>${fmt(d.createdate)}</div>`;body.appendChild(el)});
}

// ===== BÚSQUEDA =====
async function search(q){
  if(mode==='deals'&&dealView==='board'){renderBoard();return}
  document.getElementById('boardView').style.display='none';
  document.getElementById('resultsList').style.display='block';
  document.getElementById('pager').style.display='none';
  const info=document.getElementById('resultsInfo'),list=document.getElementById('resultsList');
  if(!q||q.length<2){page=0;browse();return}
  info.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Buscando...';
  if(mode==='contacts'){
    const qd=q.replace(/\D/g,''),words=q.split(/\s+/).filter(w=>w);
    let query=sb.from('contacts').select('*');
    if(qd.length>=5)query=query.or(`phone.ilike.%${qd}%,mobilephone.ilike.%${qd}%`);
    else query=query.or(`firstname.ilike.%${words[0]}%,lastname.ilike.%${words[0]}%,email.ilike.%${words[0]}%`);
    let{data}=await query.limit(200);let results=data||[];
    const wl=q.toLowerCase().split(/\s+/).filter(w=>w);
    if(wl.length>1&&qd.length<5)results=results.filter(c=>{const f=`${c.firstname||''} ${c.lastname||''} ${c.email||''}`.toLowerCase();return wl.every(w=>f.includes(w))});
    results=results.slice(0,100);
    info.textContent=`${results.length} resultado(s)`;renderContacts(results);
  }else{
    const{data}=await sb.from('deals').select('*').ilike('dealname',`%${q}%`).limit(100);
    info.textContent=`${(data||[]).length} resultado(s)`;renderDeals(data||[]);
  }
}

// ===== DETALLE CONTACTO =====
async function showContact(cid){
  const panel=document.getElementById('detailPanel');
  panel.innerHTML='<div class="loading-msg"><i class="ti ti-loader-2"></i>Cargando...</div>';panel.classList.add('visible');panel.scrollIntoView({behavior:'smooth',block:'start'});
  const[cRes,nRes,callRes,mRes,tRes,waRes,dRes]=await Promise.all([
    sb.from('contacts').select('*').eq('id',cid).single(),
    sb.from('notes').select('*').eq('contact_id',cid).order('timestamp',{ascending:false}).limit(200),
    sb.from('calls').select('*').eq('contact_id',cid).order('timestamp',{ascending:false}).limit(200),
    sb.from('meetings').select('*').eq('contact_id',cid).order('timestamp',{ascending:false}).limit(200),
    sb.from('tasks').select('*').eq('contact_id',cid).order('timestamp',{ascending:false}).limit(200),
    sb.from('whatsapp_mensajes').select('*').eq('contact_id',cid).order('timestamp',{ascending:true}).limit(500),
    sb.from('deals').select('*').eq('contact_id',cid)
  ]);
  const c=cRes.data;if(!c){panel.innerHTML='<div class="empty">No encontrado</div>';return}
  const nm=`${c.firstname||''} ${c.lastname||''}`.trim()||'Sin nombre',ini=initials(c.firstname,c.lastname),wa=waRes.data||[];
  const tl=[...(nRes.data||[]).map(n=>({type:'note',ts:n.timestamp,text:n.body,owner:n.owner_id})),...(callRes.data||[]).map(n=>({type:'call',ts:n.timestamp,text:n.body||'Llamada',owner:n.owner_id})),...(mRes.data||[]).map(n=>({type:'meeting',ts:n.timestamp,text:n.title||n.body||'Reunión',owner:n.owner_id})),...(tRes.data||[]).map(n=>({type:'task',ts:n.timestamp,text:(n.subject?n.subject+': ':'')+(n.body||'Tarea'),owner:n.owner_id}))].sort((a,b)=>new Date(b.ts||0)-new Date(a.ts||0));
  const ic={note:'ti-notes',call:'ti-phone',meeting:'ti-calendar',task:'ti-checkbox'},cl={note:'tl-note',call:'tl-call',meeting:'tl-meeting',task:'tl-task'},lb={note:'Nota',call:'Llamada',meeting:'Reunión',task:'Tarea'};
  let tlH=tl.slice(0,200).map(it=>{const t=clean(it.text);return `<div class="timeline-item"><div class="tl-icon ${cl[it.type]}"><i class="ti ${ic[it.type]}"></i></div><div class="tl-body"><div class="tl-date">${lb[it.type]} · ${fmt(it.ts)} · ${ownerName(it.owner)}</div><div class="tl-text">${t.substring(0,500)||'(sin contenido)'}${t.length>500?'...':''}</div></div></div>`}).join('');
  let waBlock='';
  if(wa.length>0){const msgs=wa.map(m=>{const dir=m.direccion==='OUTGOING'?'wa-out':'wa-in',l=m.direccion==='OUTGOING'?'NOORD':'Cliente',txt=clean(m.texto)||'(sin texto)';return `<div class="wa-msg ${dir}"><span class="dir">${l} · ${fmtT(m.timestamp)}</span><br><span class="bubble">${esc(txt.substring(0,800))}</span></div>`}).join('');waBlock=`<div class="timeline-item"><div class="tl-icon tl-wa"><i class="ti ti-brand-whatsapp"></i></div><div class="tl-body"><div class="tl-date">WhatsApp · ${wa.length} mensajes</div><span class="wa-toggle" onclick="document.getElementById('waThread').classList.toggle('open')">Ver/ocultar conversación</span><div id="waThread" class="wa-thread">${msgs}</div></div></div>`}
  const cD=dRes.data||[];
  const dH=cD.length===0?'<div class="empty">Sin negocios</div>':cD.map(d=>`<div class="card" style="margin-bottom:8px" onclick="showDeal('${d.id}')"><div class="card-name">${d.dealname||'Sin nombre'}</div><div class="card-meta"><span class="st">${stageMap[d.dealstage]||d.dealstage}</span> · ${d.amount?'$'+Number(d.amount).toLocaleString('es-MX'):'Sin monto'}${d.producto?'<span class="tag">'+d.producto+'</span>':''}</div></div>`).join('');
  const ct={note:tl.filter(x=>x.type==='note').length,call:tl.filter(x=>x.type==='call').length,meeting:tl.filter(x=>x.type==='meeting').length,task:tl.filter(x=>x.type==='task').length};
  panel.innerHTML=`<button class="close-btn" onclick="document.getElementById('detailPanel').classList.remove('visible')">×</button><div class="detail-top"><div class="avatar-lg">${ini||'?'}</div><div><div class="detail-name">${nm}${stageBadge(c.lifecyclestage)}</div><div class="detail-owner"><i class="ti ti-user"></i> ${ownerName(c.owner_id)}</div></div></div><div class="detail-fields"><div class="field-row"><i class="ti ti-mail"></i><span class="field-val">${c.email||'-'}</span></div><div class="field-row"><i class="ti ti-phone"></i><span class="field-val">${c.phone||c.mobilephone||'-'}</span></div><div class="field-row"><i class="ti ti-building-store"></i><span class="field-val">${c.producto||'-'}</span></div><div class="field-row"><i class="ti ti-broadcast"></i><span class="field-val">${c.canal||'-'}</span></div></div><div class="tabs"><div class="tab active" onclick="switchTab(this,'tab-tl')">Cronograma (${tl.length})</div><div class="tab" onclick="switchTab(this,'tab-wa')">WhatsApp (${wa.length})</div><div class="tab" onclick="switchTab(this,'tab-d')">Negocios (${cD.length})</div></div><div id="tab-tl" class="tab-content active"><div style="font-size:12px;color:var(--text-3);margin-bottom:12px">${ct.note} notas · ${ct.call} llamadas · ${ct.meeting} reuniones · ${ct.task} tareas · ${wa.length} WhatsApp</div>${waBlock}${tlH||(waBlock?'':'<div class="empty">Sin actividad</div>')}</div><div id="tab-wa" class="tab-content">${wa.length===0?'<div class="empty">Sin WhatsApp</div>':wa.map(m=>{const dir=m.direccion==='OUTGOING'?'wa-out':'wa-in',l=m.direccion==='OUTGOING'?'NOORD':'Cliente',txt=clean(m.texto)||'(sin texto)';return `<div class="wa-msg ${dir}"><span class="dir">${l} · ${fmtT(m.timestamp)}</span><br><span class="bubble">${esc(txt.substring(0,800))}</span></div>`}).join('')}</div><div id="tab-d" class="tab-content">${dH}</div>`;
}

// ===== DETALLE NEGOCIO =====
async function showDeal(did){
  const panel=document.getElementById('detailPanel');
  panel.innerHTML='<div class="loading-msg"><i class="ti ti-loader-2"></i>Cargando negocio...</div>';panel.classList.add('visible');panel.scrollIntoView({behavior:'smooth',block:'start'});
  const[dRes,n,c,t,m]=await Promise.all([
    sb.from('deals').select('*').eq('id',did).single(),
    sb.from('deal_notes').select('*').eq('deal_id',did).order('timestamp',{ascending:false}).limit(100),
    sb.from('deal_calls').select('*').eq('deal_id',did).order('timestamp',{ascending:false}).limit(100),
    sb.from('deal_tasks').select('*').eq('deal_id',did).order('timestamp',{ascending:false}).limit(100),
    sb.from('deal_meetings').select('*').eq('deal_id',did).order('timestamp',{ascending:false}).limit(100)
  ]);
  const d=dRes.data;if(!d){panel.innerHTML='<div class="empty">No encontrado</div>';return}
  const act=[...(n.data||[]).map(x=>({type:'note',ts:x.timestamp,text:x.body,owner:x.owner_id})),...(c.data||[]).map(x=>({type:'call',ts:x.timestamp,text:x.body||'Llamada',owner:x.owner_id})),...(t.data||[]).map(x=>({type:'task',ts:x.timestamp,text:(x.subject?x.subject+': ':'')+(x.body||'Tarea'),owner:x.owner_id})),...(m.data||[]).map(x=>({type:'meeting',ts:x.timestamp,text:x.title||x.body||'Reunión',owner:x.owner_id}))].sort((a,b)=>new Date(b.ts||0)-new Date(a.ts||0));
  const ic={note:'ti-notes',call:'ti-phone',meeting:'ti-calendar',task:'ti-checkbox'},cl={note:'tl-note',call:'tl-call',meeting:'tl-meeting',task:'tl-task'},lb={note:'Nota',call:'Llamada',meeting:'Reunión',task:'Tarea'};
  const actH=act.length===0?'<div class="empty">Sin actividades en este negocio</div>':act.map(it=>{const tx=clean(it.text);return `<div class="timeline-item"><div class="tl-icon ${cl[it.type]}"><i class="ti ${ic[it.type]}"></i></div><div class="tl-body"><div class="tl-date">${lb[it.type]} · ${fmt(it.ts)} · ${ownerName(it.owner)}</div><div class="tl-text">${tx.substring(0,500)||'(sin contenido)'}${tx.length>500?'...':''}</div></div></div>`}).join('');
  const ct={note:act.filter(x=>x.type==='note').length,call:act.filter(x=>x.type==='call').length,meeting:act.filter(x=>x.type==='meeting').length,task:act.filter(x=>x.type==='task').length};
  panel.innerHTML=`<button class="close-btn" onclick="document.getElementById('detailPanel').classList.remove('visible')">×</button><div class="detail-top"><div class="avatar-lg"><i class="ti ti-briefcase" style="font-size:24px"></i></div><div><div class="detail-name">${d.dealname||'Sin nombre'}</div><div class="detail-owner"><i class="ti ti-user"></i> ${ownerName(d.owner_id)}</div></div></div><div class="detail-fields"><div class="field-row"><i class="ti ti-stairs"></i><span class="field-val">${stageMap[d.dealstage]||d.dealstage}</span></div><div class="field-row"><i class="ti ti-currency-dollar"></i><span class="field-val">${d.amount?'$'+Number(d.amount).toLocaleString('es-MX'):'Sin monto'}</span></div><div class="field-row"><i class="ti ti-building-store"></i><span class="field-val">${d.producto||'-'}</span></div><div class="field-row"><i class="ti ti-broadcast"></i><span class="field-val">${d.canal||'-'}</span></div><div class="field-row"><i class="ti ti-user-star"></i><span class="field-val">Gerente: ${d.gerente_desarrollo?ownerName(d.gerente_desarrollo):'-'}</span></div><div class="field-row"><i class="ti ti-calendar-check"></i><span class="field-val">Cierre: ${fmt(d.closedate)||'-'}</span></div></div><div style="font-size:12px;color:var(--text-3);margin-bottom:12px">${ct.note} notas · ${ct.call} llamadas · ${ct.meeting} reuniones · ${ct.task} tareas</div>${actH}`;
}

function switchTab(el,id){const p=el.closest('.detail-panel');p.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));p.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));el.classList.add('active');document.getElementById(id).classList.add('active')}
document.getElementById('searchInput').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(e.target.value.trim()),350)});
document.getElementById('password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
(async()=>{const{data}=await sb.auth.getSession();if(data.session)await startApp()})();
