/* RPAssistant — сессии: планирование, запуск, экран сессии (общая доска с фоном + вывод мастера), полный экран */

/* ---------- полный экран ---------- */
const FS={
  on:()=>!!(document.fullscreenElement||document.webkitFullscreenElement),
  toggle(){const d=document.documentElement;if(FS.on())(document.exitFullscreen||document.webkitExitFullscreen).call(document);else (d.requestFullscreen||d.webkitRequestFullscreen)?.call(d)?.catch?.(()=>toast('Браузер не разрешил полный экран','err'))},
  icon:()=>FS.on()?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};
document.addEventListener('fullscreenchange',()=>document.querySelectorAll('[data-fs]').forEach(b=>{b.innerHTML=FS.icon();b.title=FS.on()?'Выйти из полного экрана (Esc)':'Полный экран'}));

/* ---------- живая сессия проекта ---------- */
class SessionHub{
  constructor(pid,isM){
    this.pid=pid;this.isM=isM;this.live=null;this.subs=new Set();
    this.ready=sb.from('game_sessions').select('*').eq('project_id',pid).eq('status','live').maybeSingle().then(({data})=>{this.live=data||null;this.emit()});
    this.ch=sb.channel('sess:'+pid).on('postgres_changes',{event:'*',schema:'public',table:'game_sessions',filter:`project_id=eq.${pid}`},pl=>this.onRow(pl)).subscribe();
  }
  on(f){this.subs.add(f);return()=>this.subs.delete(f)}
  emit(row,prev){for(const f of this.subs)try{f(this.live,row,prev)}catch(e){console.error(e)}}
  onRow(pl){
    const row=pl.new&&pl.new.id?pl.new:null,old=pl.old;const wasLive=this.live;
    if(row&&row.status==='live')this.live=row;
    else if(this.live&&(row?.id===this.live.id||old?.id===this.live.id))this.live=null;
    this.emit(row,wasLive);
    const inStage=document.body.classList.contains('in-stage');
    if(!wasLive&&this.live){ // сессия началась
      if(!this.isM&&!inStage)go('project',this.pid,'stage');
      else if(!inStage)toastAction(`Началась сессия «${this.live.title}»`,'Открыть экран',()=>go('project',this.pid,'stage'));
    }
    if(wasLive&&!this.live&&inStage){toast('Сессия завершена');go('project',this.pid,'sessions')}
  }
  destroy(){sb.removeChannel(this.ch);this.subs.clear()}
}
function drawLivePill(){
  const host=$('.livepill');if(!host)return;const L=App.sess?.live;
  host.hidden=!L||document.body.classList.contains('in-stage');
  if(L)host.innerHTML=`<button class="btn sm lp" data-stage title="Открыть экран сессии"><i></i>Идёт сессия · ${esc(L.title)}</button>`;
  host.querySelector('[data-stage]')?.addEventListener('click',()=>go('project',App.sess.pid,'stage'));
}

/* ---------- вкладка «Сессии» ---------- */
const fmtDate=iso=>{if(!iso)return 'Дата не назначена';const d=new Date(iso);return d.toLocaleDateString(I18N.loc,{weekday:'long',day:'numeric',month:'long'})+', '+d.toLocaleTimeString(I18N.loc,{hour:'2-digit',minute:'2-digit'})};
const relTime=iso=>{if(!iso)return '';const ms=new Date(iso)-Date.now(),m=Math.round(Math.abs(ms)/60000);const h=Math.round(m/60),d=Math.round(h/24);
  const t=m<60?`${m} ${plural(m,'минуту','минуты','минут')}`:h<36?`${h} ${plural(h,'час','часа','часов')}`:`${d} ${plural(d,'день','дня','дней')}`;return ms>0?'через '+t:t+' назад'};
const toLocalInput=iso=>{if(!iso)return '';const d=new Date(iso);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};

async function renderSessionsTab(main,pid,isM){
  main.innerHTML=`<div class="sessions"><div class="ss-h"><h2>Сессии</h2>${isM?'<button class="btn primary" data-new>+ Запланировать сессию</button>':''}</div><div class="ss-body"><div class="loading"><div class="spin"></div></div></div></div>`;
  const body=$('.ss-body',main);let list=[],plans={};
  const load=async()=>{
    const {data,error}=await sb.from('game_sessions').select('id,project_id,title,starts_at,duration_min,announce,summary,status,started_at,ended_at').eq('project_id',pid).order('starts_at',{ascending:true,nullsFirst:false});
    if(error&&/game_sessions|42P01|PGRST205|schema cache/i.test((error.message||'')+(error.code||''))){body.innerHTML=`<div class="ss-empty">${isM?'Сессии появятся после обновления базы данных: нужно один раз выполнить <b>supabase/007_sessions.sql</b> в Supabase → SQL Editor.':'Мастер ещё настраивает сессии — загляните чуть позже.'}</div>`;return}
    if(fail(error))return;list=data||[];
    if(isM){const {data:pl}=await sb.from('session_gm_notes').select('session_id,plan').eq('project_id',pid);plans=Object.fromEntries((pl||[]).map(x=>[x.session_id,x.plan]))}
    draw();
  };
  const card=(s,kind)=>`<div class="ss-card ${kind}" data-id="${s.id}">
    <div class="ss-date"><b>${s.starts_at?new Date(s.starts_at).getDate():'—'}</b><span>${s.starts_at?new Date(s.starts_at).toLocaleDateString(I18N.loc,{month:'short'}):''}</span></div>
    <div class="ss-main"><div class="ss-t">${kind==='live'?'<span class="dot"></span>':''}${esc(s.title)}</div>
      <div class="ss-when">${kind==='live'?`Идёт с ${new Date(s.started_at).toLocaleTimeString(I18N.loc,{hour:'2-digit',minute:'2-digit'})}`:esc(fmtDate(s.starts_at))}${s.starts_at&&kind==='plan'?` · <span class="rel">${relTime(s.starts_at)}</span>`:''}${s.duration_min&&kind!=='done'?` · ~${Math.round(s.duration_min/6)/10} ч`:''}</div>
      ${s.announce?`<div class="ss-ann">${esc(s.announce)}</div>`:''}
      ${kind==='done'&&s.summary?`<div class="ss-sum"><b>Итоги:</b> ${esc(s.summary)}</div>`:''}
      ${isM&&plans[s.id]?`<details class="ss-plan"><summary>План мастера</summary><div>${esc(plans[s.id])}</div></details>`:''}
    </div>
    <div class="ss-act">${kind==='live'?`<button class="btn primary" data-open>Открыть экран</button>${isM?'<button class="btn" data-end>Завершить</button>':''}`:''}
      ${kind==='plan'&&isM?'<button class="btn primary" data-start>▶ Начать</button>':''}
      ${isM?`<button class="btn ghost sm" data-edit title="Изменить">✎</button><button class="btn ghost sm" data-del title="Удалить">🗑</button>`:''}</div></div>`;
  const draw=()=>{
    const live=list.filter(s=>s.status==='live'),plan=list.filter(s=>s.status==='planned'),done=list.filter(s=>s.status==='done').reverse();
    body.innerHTML=(live.length?`<section><h3>Сейчас</h3>${live.map(s=>card(s,'live')).join('')}</section>`:'')
      +`<section><h3>Запланированы</h3>${plan.length?plan.map(s=>card(s,'plan')).join(''):`<div class="muted ss-empty">${isM?'Запланируйте встречу — игроки увидят дату и анонс.':'Мастер пока не назначил следующую сессию.'}</div>`}</section>`
      +(done.length?`<section><h3>Прошедшие</h3>${done.map(s=>card(s,'done')).join('')}</section>`:'');
  };
  body.onclick=async e=>{const c=e.target.closest('.ss-card');if(!c)return;const s=list.find(x=>x.id===c.dataset.id);
    if(e.target.closest('[data-open]'))return go('project',pid,'stage');
    if(e.target.closest('[data-start]')){const {error}=await sb.rpc('start_session',{s:s.id});if(!fail(error))go('project',pid,'stage');return}
    if(e.target.closest('[data-end]')){if(await confirmBox(`Завершить сессию «${s.title}»?`,'Завершить'))await endSession(s.id);load();return}
    if(e.target.closest('[data-edit]'))return editSession(pid,s,plans[s.id]||'',load);
    if(e.target.closest('[data-del]')){if(await confirmBox(`Удалить сессию «${s.title}»?`)){const {error}=await sb.from('game_sessions').delete().eq('id',s.id);if(!fail(error))load()}return}
  };
  if(isM)main.querySelector('[data-new]').onclick=()=>editSession(pid,null,'',load);
  const off=App.sess?.on(()=>load());App.unsub=()=>off?.();
  load();
}
async function endSession(id){const {error}=await sb.from('game_sessions').update({status:'done',ended_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);fail(error)}
function editSession(pid,s,plan,done){
  const next=new Date();next.setDate(next.getDate()+((6-next.getDay()+7)%7||7));next.setHours(19,0,0,0);
  const {el,close}=openModal(`<h3>${s?'Сессия':'Новая сессия'}</h3><form class="ssf">
    <label class="f">Название<input name="t" required maxlength="80" value="${esc(s?.title||'')}" placeholder="Например: Сессия 3 — Бал у Принца"></label>
    <div class="wz-g2"><label class="f">Дата и время<input type="datetime-local" name="d" value="${toLocalInput(s?.starts_at||next.toISOString())}"></label><label class="f">Длительность, часов<input type="number" name="h" min="0.5" max="24" step="0.5" value="${(s?.duration_min||180)/60}"></label></div>
    <label class="f">Анонс для игроков<textarea name="a" rows="3" placeholder="Что ждёт персонажей, что подготовить">${esc(s?.announce||'')}</textarea></label>
    <label class="f">План мастера <small class="muted">— видите только вы и сомастера</small><textarea name="p" rows="5" placeholder="Сцены, NPC, зацепки, музыка">${esc(plan||'')}</textarea></label>
    ${s?.status==='done'?`<label class="f">Итоги для игроков<textarea name="s" rows="3">${esc(s.summary||'')}</textarea></label>`:''}
    <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">${s?'Сохранить':'Запланировать'}</button></div></form>`);
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  const f=el.querySelector('form');
  f.onsubmit=async e=>{e.preventDefault();
    const row={title:f.t.value.trim(),starts_at:f.d.value?new Date(f.d.value).toISOString():null,duration_min:Math.round((+f.h.value||3)*60),announce:f.a.value.trim(),updated_at:new Date().toISOString()};
    if(f.s)row.summary=f.s.value.trim();
    let id=s?.id;
    if(s){const {error}=await sb.from('game_sessions').update(row).eq('id',s.id);if(fail(error))return}
    else{const {data,error}=await sb.from('game_sessions').insert({...row,status:'planned',project_id:pid,created_by:App.user.id}).select('id').single();if(fail(error))return;id=data.id}
    const pl=f.p.value.trim();if(pl||plan){const {error}=await sb.from('session_gm_notes').upsert({session_id:id,project_id:pid,plan:pl,updated_at:new Date().toISOString()});fail(error)}
    close();done?.()};
}

/* ---------- экран сессии ---------- */
const STAGE_BG=['#14161f','#0b0b0f','#1d1016','#101b16','#121a2b','#2a2219','#e8e2d4','#ffffff'];
/* библиотека готовых фонов проекта (хранится служебной записью в map_templates) */
const BG_KEY='__stage_bgs__';
const BgLib={
  async load(pid){const {data,error}=await sb.from('map_templates').select('id,items').eq('project_id',pid).eq('name',BG_KEY);if(error){console.error(error);return []}this.row=(data||[])[0]||null;this.pid=pid;return (this.row?.items||[]).filter(x=>x&&x.src)},
  async save(pid,list){
    if(this.pid!==pid)await this.load(pid);
    if(this.row?.id){const {error}=await sb.from('map_templates').update({items:list}).eq('id',this.row.id);if(fail(error))return false;this.row.items=list;return true}
    const {data,error}=await sb.from('map_templates').insert({project_id:pid,name:BG_KEY,icon:'🖼',items:list,created_by:App.user.id}).select('id,items').single();if(fail(error))return false;this.row=data||{items:list};return true},
  async add(pid,src,name){const l=await this.load(pid);if(l.some(x=>x.src===src))return l;l.push({src,name:name||'',at:Date.now()});await this.save(pid,l);return l},
};
const bgThumbs=(list,cur,del)=>list.map((x,i)=>`<div class="bgt ${cur===x.src?'on':''}" data-pick="${i}" title="${esc(x.name||'')}" style="background-image:url(&quot;${esc(x.src)}&quot;)">${del?`<button type="button" class="bgx" data-del="${i}" title="Убрать из библиотеки">×</button>`:''}${x.name?`<span>${esc(x.name)}</span>`:''}</div>`).join('');
async function manageBgs(pid,onPick){
  let list=await BgLib.load(pid);
  const {el,close}=openModal(`<h3>Готовые фоны</h3><p class="muted" style="margin:-4px 0 12px;font-size:13px">Загрузите фоны заранее — в сессии они будут под кнопкой «🎨 Фон», выбор в один клик.</p>
    <div class="bglib big" data-grid></div>
    <form class="row-g" style="gap:8px;margin-top:12px;flex-wrap:wrap"><label class="btn">Загрузить файлы<input type="file" accept="image/*" multiple hidden data-files></label><input name="u" placeholder="или ссылка на картинку https://…" style="flex:1;min-width:200px"><button class="btn">Добавить</button></form>
    <div class="modal-actions"><button type="button" class="btn primary" data-close>Готово</button></div>`);
  const grid=el.querySelector('[data-grid]');
  const draw=()=>{grid.innerHTML=list.length?bgThumbs(list,null,true):'<div class="muted" style="grid-column:1/-1;padding:18px;text-align:center;border:1px dashed var(--line);border-radius:10px">Пока пусто</div>'};draw();
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  grid.onclick=async e=>{const d=e.target.closest('[data-del]');if(d){list.splice(+d.dataset.del,1);draw();await BgLib.save(pid,list);return}
    const t=e.target.closest('[data-pick]');if(t&&onPick){onPick(list[+t.dataset.pick].src);close()}};
  const fi=el.querySelector('[data-files]');
  fi.onchange=async()=>{const fs=[...fi.files];if(!fs.length)return;toast(`Загружаю ${fs.length} шт.…`);
    for(const f of fs){try{const src=await API.upload(pid,f,(f.name.split('.').pop()||'png').toLowerCase());list.push({src,name:f.name.replace(/\.[^.]+$/,'').slice(0,40),at:Date.now()});draw()}catch(err){fail(err)}}
    await BgLib.save(pid,list);fi.value='';toast('Фоны добавлены')};
  el.querySelector('form').onsubmit=async e=>{e.preventDefault();const u=e.target.u.value.trim();if(!u)return;if(!list.some(x=>x.src===u)){list.push({src:u,name:'',at:Date.now()});draw();await BgLib.save(pid,list)}e.target.u.value=''};
}
async function renderStage(main,pid,isM,p){
  document.body.classList.add('in-stage');document.body.classList.toggle('stage-player',!isM);drawLivePill();
  await App.sess.ready;
  const {data:liveRow}=await sb.from('game_sessions').select('*').eq('project_id',pid).eq('status','live').maybeSingle();
  let s=liveRow||null;App.sess.live=s;
  if(!s){main.innerHTML=`<div class="soon"><div class="panel"><div class="ic">🎭</div><h2>Сессия не идёт</h2><p class="muted">${isM?'Начните сессию во вкладке «Сессии».':'Когда мастер начнёт сессию, экран откроется сам.'}</p><button class="btn primary" data-back>${isM?'К сессиям':'Назад'}</button></div></div>`;main.querySelector('[data-back]').onclick=()=>go('project',pid,'sessions');return}
  main.innerHTML=`<div class="stage"><div class="st-bg"></div><div class="st-scene"></div>${isM?'<div class="st-ctrl"></div>':''}<div class="st-corner"><div class="mdock st-dock" hidden></div><button class="stc" data-fs></button>${isM?'':'<button class="stc" data-menu title="Ещё">⋯</button><button class="stc stx" data-leave title="Выйти из экрана сессии в меню проекта. Вернуться — кнопка «Идёт сессия» вверху">✕ Выйти в меню</button>'}</div></div>`;
  const stEl=$('.stage',main),sceneEl=$('.st-scene',main),bgEl=$('.st-bg',main),ctrl=$('.st-ctrl',main);
  App.inStage=true;
  let sceneKey='',bd=null,mv=null,charOff=null,maps=[];
  const st=()=>({scene:'board',overlays:{chars:true,dice:true,draw:false},...(s.stage||{}),overlays:{chars:true,dice:true,draw:false,...(s.stage?.overlays||{})}});
  const save=async patch=>{Object.assign(s,patch);applyAll();const {error}=await sb.from('game_sessions').update({...patch,client:CLIENT_ID,updated_at:new Date().toISOString()}).eq('id',s.id);fail(error)};
  // общая доска сессии: изменения отправляются операциями, как на основной доске
  let inflight=false,again=false,tm;
  const push=async()=>{if(!bd)return;if(inflight){again=true;return}const ops=bd.diffOps();if(!ops)return;inflight=true;
    try{const {error}=await sb.rpc('apply_session_ops',{s:s.id,ups:ops.ups,dels:ops.dels,ord:ops.ord,cl:CLIENT_ID});if(error)throw error;bd.base=Board.applyOps(bd.base,ops)}
    catch(e){console.error(e);if(String(e.message||e).includes('forbidden')){toast('Мастер закрыл рисование на доске','err');bd.applyRemote(bd.base)}else setTimeout(push,3000)}
    finally{inflight=false;if(again){again=false;push()}}};
  const canDraw=()=>isM||st().overlays.draw;
  const mountScene=async()=>{
    const S=st();const key=S.scene==='map'?'map:'+S.map_id:S.scene==='image'?'img:'+S.image:'board:'+canDraw();
    if(key===sceneKey)return;sceneKey=key;
    if(bd){bd.destroy();bd=null;App.board=null}if(mv){mv.destroy();mv=null;App.mapView=null}
    sceneEl.innerHTML='';stEl.dataset.scene=S.scene;
    if(S.scene==='map'&&S.map_id){
      const {data:m}=await sb.from('maps').select('*').eq('id',S.map_id).maybeSingle();
      if(!m){sceneEl.innerHTML='<div class="st-msg">Карта недоступна</div>';return}
      mv=new MapView(sceneEl,m,{canEdit:isM,pid,templates:()=>[],reloadTemplates:()=>{},members:()=>API.members(pid).catch(()=>[]),onBack:()=>{},onListChange:()=>{}});App.mapView=mv;drawCtrl();
    }else if(S.scene==='image'&&S.image){
      sceneEl.innerHTML=`<div class="st-img"><img src="${esc(S.image)}" alt="" referrerpolicy="no-referrer"></div>`;
    }else{
      const vk='rpa_sview_'+s.id;let view=null;try{view=JSON.parse(LS.get(vk))}catch(_){}
      bd=new Board(sceneEl,{items:s.items||[],view},{author:App.user.name,readonly:!canDraw(),roBadge:'Доска сессии',onChange:canDraw()?(items,now)=>{clearTimeout(tm);if(now)push();else tm=setTimeout(push,300)}:null,onView:v=>LS.set(vk,JSON.stringify(v)),upload:(blob,ext)=>API.upload(pid,blob,ext)});
      bd.root.classList.add('stageboard');App.board=bd;
    }
  };
  const applyBg=()=>{const b=s.bg||{};bgEl.style.background=b.color||'';bgEl.style.backgroundImage=b.image?`url("${b.image.replace(/"/g,'%22')}")`:'';bgEl.classList.toggle('img',!!b.image);stEl.classList.toggle('light',!!b.color&&/^#(e|f|d)/i.test(b.color)&&!b.image)};
  const applyOverlays=()=>{const o=st().overlays;
    document.body.classList.toggle('stage-nodice',!isM&&!o.dice);
    if(!isM){if(o.chars&&!charOff)charOff=mountMapCharPanel({host:{querySelector:()=>stEl},ctx:{pid}});else if(!o.chars&&charOff){charOff();charOff=null}}
    else if(!charOff)charOff=mountMapCharPanel({host:{querySelector:()=>stEl},ctx:{pid}});
  };
  const drawCtrl=()=>{if(!ctrl)return;const S=st(),o=S.overlays,col=LS.get('rpa_stctrl')==='0';
    ctrl.classList.toggle('min',col);
    ctrl.innerHTML=col?`<button class="sc-pill" data-expand title="Панель мастера"><i class="dot"></i>${esc(s.title)}</button>`:`
      <span class="sc-t" title="${esc(s.title)}"><i class="dot"></i>${esc(s.title)}</span>
      <span class="sc-g"><span class="sc-l">Игрокам</span>
        <button class="${S.scene==='board'?'on':''}" data-scene="board" title="Показать общую доску">▦ Доска</button>
        <select data-map title="Показать карту"><option value="">🗺 Карта…</option>${maps.map(m=>`<option value="${m.id}" ${S.scene==='map'&&S.map_id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></span>
      ${S.scene==='map'&&mv?`<span class="sc-g"><span class="sc-l">Карта</span>
        <button class="ic" data-mv="settings" title="Сетка, размер и фон карты">⚙</button>
        <button class="ic ${mv.S.snap?'on':''}" data-mv="snap" title="Прилипание к клеткам">🧲</button>
        ${mv.fog.enabled?`<button class="ic" data-mv="fogclear" title="Убрать туман с карты целиком">🌫✕</button>`:''}</span>`
      :`<span class="sc-g"><button data-bg title="Фон доски">🎨 Фон</button></span>`}
      <span class="sc-g"><span class="sc-l">Могут</span>
        <button class="tg ${o.draw?'on':''}" data-ov="draw" title="Игроки рисуют и пишут на доске">✏️</button>
        <button class="tg ${o.chars?'on':''}" data-ov="chars" title="Панель персонажа у игроков (броски и силы)">🧛</button>
        <button class="tg ${o.dice?'on':''}" data-ov="dice" title="Журнал бросков у игроков">🎲</button></span>
      <span class="sc-g"><button data-proj title="Вкладки проекта — сессия продолжится">☰ Проект</button><button class="end" data-endsess title="Завершить сессию">■ Завершить</button><button data-collapse title="Свернуть панель">▴</button></span>`;
  };
  const applyAll=()=>{applyBg();applyOverlays();mountScene();drawCtrl()};
  if(isM){const {data}=await sb.from('maps').select('id,name,shared').eq('project_id',pid).order('sort').order('created_at');maps=data||[]}
  ctrl?.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const S=st();
    if(b.dataset.expand!==undefined||b.dataset.collapse!==undefined){LS.set('rpa_stctrl',b.dataset.collapse!==undefined?'0':'1');drawCtrl();return}
    if(b.dataset.scene==='board')return save({stage:{...S,scene:'board'}});
    if(b.dataset.scene==='image')return pickImage('Картинка для игроков',url=>save({stage:{...S,scene:'image',image:url}}),S.image);
    if(b.dataset.ov){const o={...S.overlays,[b.dataset.ov]:!S.overlays[b.dataset.ov]};return save({stage:{...S,overlays:o}})}
    if(b.dataset.bg!==undefined)return bgPop(b);
    if(b.dataset.mv&&mv){const map={settings:'[data-settings]',snap:'[data-snap]',fog:'[data-fog]',fogall:'[data-fogall]',fogclear:'[data-fogclear]',ptoks:'[data-ptoks]'};
      mv.head.querySelector(map[b.dataset.mv])?.click();setTimeout(drawCtrl,60);return}
    if(b.dataset.proj!==undefined)return go('project',pid,'board');
    if(b.dataset.endsess!==undefined){if(await confirmBox(`Завершить сессию «${s.title}»? У игроков закроется экран сессии.`,'Завершить'))await endSession(s.id);return}
  });
  ctrl?.addEventListener('change',async e=>{if(e.target.dataset.map===undefined||!e.target.value)return;const id=e.target.value,m=maps.find(x=>x.id===id);
    if(m&&!m.shared){await sb.from('maps').update({shared:true}).eq('id',id);m.shared=true;App.hub?.mapsChanged()}
    save({stage:{...st(),scene:'map',map_id:id}})});
  const pickImage=(title,cb,cur)=>{const {el,close}=openModal(`<h3>${esc(title)}</h3><form><label class="f">Файл<input type="file" name="f" accept="image/*"></label><label class="f">или ссылка на картинку<input name="u" placeholder="https://…" value="${esc(cur||'')}"></label><div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Показать</button></div></form>`);
    el.querySelectorAll('[data-close]').forEach(x=>x.onclick=close);const f=el.querySelector('form');
    f.onsubmit=async ev=>{ev.preventDefault();let url=f.u.value.trim();const file=f.f.files[0];
      if(file){const btn=f.querySelector('.primary');btn.disabled=true;try{url=await API.upload(pid,file,(file.name.split('.').pop()||'png').toLowerCase())}catch(err){fail(err);btn.disabled=false;return}}
      if(!url)return;close();cb(url)}};
  const bgPop=btn=>{$('.st-bgpop')?.remove();const b=s.bg||{};const pop=document.createElement('div');pop.className='st-bgpop';
    const setImg=src=>save({bg:{...(s.bg||{}),image:src}});
    pop.innerHTML=`<div class="lbl">Цвет фона</div><div class="r">${STAGE_BG.map(c=>`<button data-c="${c}" class="${b.color===c&&!b.image?'on':''}" style="background:${c}"></button>`).join('')}<label class="cc" title="Свой цвет"><input type="color" value="${b.color||'#14161f'}"></label></div>
      <div class="lbl">Готовые фоны <button class="lnk" data-manage>управлять</button></div><div class="bglib" data-lib><div class="muted" style="grid-column:1/-1;font-size:12px">Загружаю…</div></div>
      <div class="r" style="margin:8px 0 0"><button class="btn sm" data-img>+ Загрузить или ссылка…</button>${b.image?'<button class="btn sm ghost" data-noimg>Убрать картинку</button>':''}</div>`;
    stEl.appendChild(pop);const place=()=>{const r=btn.getBoundingClientRect(),sr=stEl.getBoundingClientRect();pop.style.top=(r.bottom-sr.top+8)+'px';pop.style.left=Math.max(8,Math.min(r.left-sr.left,sr.width-pop.offsetWidth-8))+'px'};place();
    let lib=[];BgLib.load(pid).then(l=>{lib=l;const g=pop.querySelector('[data-lib]');if(!g)return;g.innerHTML=l.length?bgThumbs(l,b.image):'<div class="muted" style="grid-column:1/-1;font-size:12px;line-height:1.4">Пока пусто — загрузите картинку ниже или подготовьте фоны заранее: «Карты» → «🖼 Фоны».</div>';place()});
    pop.onclick=ev=>{const x=ev.target.closest('[data-c],[data-img],[data-noimg],[data-pick],[data-manage]');if(!x)return;
      if(x.dataset.c){save({bg:{color:x.dataset.c}});pop.remove()}
      if(x.dataset.pick!==undefined){setImg(lib[+x.dataset.pick].src);pop.remove()}
      if(x.dataset.manage!==undefined){pop.remove();manageBgs(pid,setImg)}
      if(x.dataset.img!==undefined){pop.remove();pickImage('Фон доски',url=>{setImg(url);BgLib.add(pid,url)},'')}
      if(x.dataset.noimg!==undefined){save({bg:{color:b.color||''}});pop.remove()}};
    pop.querySelector('input[type=color]').onchange=ev=>{save({bg:{color:ev.target.value}});pop.remove()};
    setTimeout(()=>document.addEventListener('pointerdown',function h(ev){if(!pop.contains(ev.target)&&ev.target!==btn){pop.remove();document.removeEventListener('pointerdown',h)}}),0)};
  stEl.querySelector('[data-fs]').onclick=()=>FS.toggle();stEl.querySelector('[data-fs]').innerHTML=FS.icon();stEl.querySelector('[data-fs]').title=FS.on()?'Выйти из полного экрана':'Полный экран';
  stEl.querySelector('[data-leave]')?.addEventListener('click',()=>go('project',pid,'sessions'));
  stEl.querySelector('[data-menu]')?.addEventListener('click',e=>{$('.st-menu')?.remove();const m=document.createElement('div');m.className='st-menu';m.innerHTML=`<button data-x="sess">Расписание сессий</button><button data-x="chars">Мой персонаж</button><button data-x="rules">Правила</button>`;stEl.appendChild(m);
    m.onclick=ev=>{const x=ev.target.closest('[data-x]');if(x)go('project',pid,x.dataset.x==='sess'?'sessions':x.dataset.x)};
    setTimeout(()=>document.addEventListener('pointerdown',function h(ev){if(!m.contains(ev.target)){m.remove();document.removeEventListener('pointerdown',h)}}),0)});
  // изменения сессии в реальном времени
  const off=App.sess.on((live,row)=>{if(!row||row.id!==s.id||row.status!=='live')return;
    const remote=row.client!==CLIENT_ID;const itemsChanged=JSON.stringify(row.items)!==JSON.stringify(s.items);
    s={...s,...row};if(bd&&remote&&itemsChanged)bd.applyRemote(row.items||[]);applyAll()});
  const dockOff=App.music?mountDock(stEl.querySelector('.st-dock'),App.music,null):null;
  App.unsub=()=>{off();dockOff?.();if(charOff)charOff();if(mv){mv.destroy();App.mapView=null}App.inStage=false;document.body.classList.remove('stage-nodice','stage-player');$('.st-bgpop')?.remove()};
  applyAll();
}
