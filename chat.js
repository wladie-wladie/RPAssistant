/* RPAssistant — чат проекта: общий канал и личные сообщения (мастеру / игроку) */
class ChatHub{
  constructor(pid,isM){
    this.pid=pid;this.isM=isM;this.msgs=[];this.subs=new Set();this.members=[];this.missing=false;
    this.ready=this.load();
    this.ch=sb.channel('chat:'+pid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`project_id=eq.${pid}`},pl=>this.add(pl.new,true))
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_messages',filter:`project_id=eq.${pid}`},pl=>{const m=pl.new,i=this.msgs.findIndex(x=>x.id===m?.id);if(i>=0){this.msgs[i]={...this.msgs[i],...m};this.emit(null)}})
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'chat_messages'},pl=>{const id=pl.old?.id;if(id&&this.msgs.some(m=>m.id===id)){this.msgs=this.msgs.filter(m=>m.id!==id);this.emit(null)}})
      .subscribe();
  }
  async load(){
    const [r,mem]=await Promise.all([
      sb.from('chat_messages').select('*').eq('project_id',this.pid).order('created_at',{ascending:false}).limit(150),
      API.members(this.pid).catch(()=>[])]);
    this.members=mem||[];
    if(r.error){if(/chat_messages|42P01|PGRST205|schema cache/i.test((r.error.message||'')+(r.error.code||'')))this.missing=true;else console.error(r.error);return}
    this.msgs=(r.data||[]).reverse();this.emit(null);
  }
  add(m,live){if(!m||this.msgs.some(x=>x.id===m.id))return;
    // личное чужое сообщение игроку не показываем (RLS отфильтрует и так, это страховка для realtime)
    if(!this.isM&&(m.to_gm||(m.to_id&&m.to_id!==App.user.id))&&m.author_id!==App.user.id)return;
    this.msgs.push(m);if(this.msgs.length>300)this.msgs.shift();this.emit(live?m:null)}
  on(f){this.subs.add(f);return()=>this.subs.delete(f)}
  emit(m){this.subs.forEach(f=>{try{f(m)}catch(e){console.error(e)}})}
  nameOf(id){if(id===App.user.id)return App.user.name||'Вы';const m=this.members.find(x=>x.user_id===id);return m?.profile?.name||'Мастер'}
  async send(text,to){
    const rec={project_id:this.pid,author_id:App.user.id,author_name:App.user.name||'',text:text.slice(0,2000),to_id:to&&to!=='gm'?to:null,to_gm:to==='gm'};
    const {data,error}=await sb.from('chat_messages').insert(rec).select('*').single();
    if(error){if(/chat_messages|42P01|PGRST205|schema cache/i.test((error.message||'')+(error.code||''))){this.missing=true;this.emit(null);return false}fail(error);return false}
    this.add(data,false);return true;
  }
  async edit(id,text){const t=text.trim().slice(0,2000);if(!t)return false;const {data,error}=await sb.from('chat_messages').update({text:t,edited_at:new Date().toISOString()}).eq('id',id).select('*').single();
    if(error){if(/edited_at|column/i.test(error.message||''))toast('Чтобы править сообщения, выполните заново supabase/008_chat.sql в Supabase','err');else fail(error);return false}
    const i=this.msgs.findIndex(x=>x.id===id);if(i>=0)this.msgs[i]={...this.msgs[i],...(data||{text:t})};this.emit(null);return true}
  async remove(id){const {error}=await sb.from('chat_messages').delete().eq('id',id);if(fail(error))return;this.msgs=this.msgs.filter(m=>m.id!==id);this.emit(null)}
  destroy(){if(this.ch)sb.removeChannel(this.ch);this.subs.clear()}
}

function mountChat(){
  {const o=$('.chatw');if(o){o._off?.();o.remove()}}const H=App.chat;if(!H)return;
  const el=document.createElement('div');el.className='chatw';
  el.innerHTML=`<button class="cw-btn" title="Чат">💬<span class="cw-n" hidden></span></button>
    <div class="cw-peek" hidden></div>
    <div class="cw-panel" hidden><div class="cw-h"><b>Чат</b><span class="spacer"></span><button class="btn ghost sm" data-x title="Свернуть">✕</button></div>
      <div class="cw-list"></div>
      <form class="cw-f"><div class="cw-to"><span>Кому:</span><select name="to"></select></div>
        <div class="cw-in"><textarea name="t" rows="1" maxlength="2000" placeholder="Сообщение… (Enter — отправить)"></textarea><button class="btn primary sm" title="Отправить">➤</button></div></form></div>`;
  document.body.appendChild(el);
  const btn=el.querySelector('.cw-btn'),panel=el.querySelector('.cw-panel'),list=el.querySelector('.cw-list'),n=el.querySelector('.cw-n'),peek=el.querySelector('.cw-peek'),f=el.querySelector('form'),ta=f.t,sel=f.to;
  let editing=null;
  let unseen=0,peekT=null,to=LS.get('rpa_chat_to_'+H.pid)||'';
  const me=App.user.id;
  const opts=()=>{
    const others=H.members.filter(m=>m.user_id!==me);
    const o=[['','Всем']];
    if(!H.isM)o.push(['gm','🔒 Мастеру']);
    for(const m of others)o.push([m.user_id,'🔒 '+(m.profile?.name||'Игрок')+(m.role==='comaster'?' (со-мастер)':'')]);
    if(!o.some(x=>x[0]===to))to='';
    sel.innerHTML=o.map(([v,t])=>`<option value="${v}" ${v===to?'selected':''}>${esc(t)}</option>`).join('');
    f.classList.toggle('priv',!!to);
  };
  const time=d=>new Date(d).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
  const day=d=>new Date(d).toLocaleDateString('ru',{day:'numeric',month:'long'});
  const target=m=>m.to_gm?'мастеру':m.to_id?(m.to_id===me?'вам':H.nameOf(m.to_id)):'';
  const draw=()=>{
    if(H.missing){list.innerHTML=`<div class="cw-empty">${H.isM?'Чат заработает после обновления базы данных: нужно один раз выполнить <b>supabase/008_chat.sql</b> в Supabase → SQL Editor.':'Мастер ещё не включил чат.'}</div>`;f.hidden=true;return}
    f.hidden=false;
    if(!H.msgs.length){list.innerHTML='<div class="cw-empty">Сообщений пока нет. Напишите первым — увидят все участники; для личного сообщения выберите получателя ниже.</div>';return}
    let last='',prevA=null,prevT=0;
    list.innerHTML=H.msgs.map(m=>{const dd=day(m.created_at);let h='';
      if(dd!==last){h+=`<div class="cw-day">${dd}</div>`;last=dd;prevA=null}
      const mine=m.author_id===me,priv=m.to_gm||m.to_id,t=+new Date(m.created_at);
      const cont=prevA===m.author_id+'|'+(priv?target(m):'')&&t-prevT<5*60e3;prevA=m.author_id+'|'+(priv?target(m):'');prevT=t;
      const who=mine?'Вы':(m.author_name||H.nameOf(m.author_id));
      h+=`<div class="cw-m ${mine?'cw-me':''} ${priv?'cw-pr':''} ${cont?'cw-cont':''}" data-id="${m.id}">
        ${cont?'':`<div class="cw-a"><b ${mine?'':`data-reply="${m.author_id}" title="Ответить лично"`}>${esc(who)}</b>${priv?`<span class="cw-pv">🔒 ${esc(mine||m.to_id!==me?'→ '+target(m):'лично вам')}</span>`:''}<span class="cw-tm">${time(m.created_at)}</span></div>`}
        <div class="cw-t">${editing===m.id?`<textarea class="cw-ed" rows="2">${esc(m.text)}</textarea><div class="cw-edh">Enter — сохранить · Esc — отмена</div>`:`${esc(m.text).replace(/\n/g,'<br>')}${m.edited_at?'<span class="cw-edited" title="Сообщение изменено">изм.</span>':''}`}${editing!==m.id&&(mine||H.isM)?`<span class="cw-tools">${mine?`<button data-edit="${m.id}" title="Изменить">✎</button>`:''}<button data-del="${m.id}" title="Удалить">×</button></span>`:''}</div></div>`;
      return h}).join('');
  };
  const atBottom=()=>list.scrollHeight-list.scrollTop-list.clientHeight<40;
  const scrollEnd=()=>{list.scrollTop=list.scrollHeight};
  const openP=v=>{panel.hidden=!v;el.classList.toggle('open',v);LS.set('rpa_chat_open',v?'1':'0');if(v){unseen=0;n.hidden=true;peek.hidden=true;fp();opts();draw();scrollEnd();setTimeout(()=>ta.focus(),0)}};
  const fp=floatPanel(panel,el.querySelector('.cw-h'),'chat');
  btn.onclick=()=>openP(panel.hidden);
  el.querySelector('[data-x]').onclick=()=>openP(false);
  peek.onclick=()=>openP(true);
  sel.onchange=()=>{to=sel.value;LS.set('rpa_chat_to_'+H.pid,to);f.classList.toggle('priv',!!to)};
  const grow=()=>{ta.style.height='auto';ta.style.height=Math.min(120,ta.scrollHeight)+'px'};
  ta.oninput=grow;
  ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();f.requestSubmit()}};
  f.onsubmit=async e=>{e.preventDefault();const t=ta.value.trim();if(!t)return;ta.value='';grow();const ok=await H.send(t,to||null);if(!ok){ta.value=t;grow()}else scrollEnd()};
  const startEdit=id=>{editing=id;draw();const t=list.querySelector('.cw-ed');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);t.style.height=Math.min(160,t.scrollHeight)+'px'}};
  list.addEventListener('keydown',async e=>{const t=e.target.closest('.cw-ed');if(!t)return;
    if(e.key==='Escape'){e.preventDefault();editing=null;draw();return}
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();const id=editing,v=t.value;if(!v.trim()){editing=null;draw();return}editing=null;if(!await H.edit(id,v))draw();ta.focus()}});
  list.addEventListener('input',e=>{const t=e.target.closest('.cw-ed');if(t){t.style.height='auto';t.style.height=Math.min(160,t.scrollHeight)+'px'}});
  ta.addEventListener('keydown',e=>{if(e.key==='ArrowUp'&&!ta.value){const last=[...H.msgs].reverse().find(m=>m.author_id===me);if(last){e.preventDefault();startEdit(last.id)}}});
  list.onclick=async e=>{
    const ed=e.target.closest('[data-edit]');if(ed)return startEdit(ed.dataset.edit);const d=e.target.closest('[data-del]');if(d){if(await confirmBox('Удалить сообщение?','Удалить'))H.remove(d.dataset.del);return}
    const r=e.target.closest('[data-reply]');if(r){const id=r.dataset.reply;to=H.members.some(m=>m.user_id===id)?id:(H.isM?'':'gm');LS.set('rpa_chat_to_'+H.pid,to);opts();ta.focus()}};
  // клавиши и колесо внутри чата не должны уходить в доску/карту
  ['keydown','wheel','pointerdown'].forEach(t=>el.addEventListener(t,e=>e.stopPropagation()));
  const off=H.on(m=>{
    if(!panel.hidden){if(editing)return;const b=atBottom();draw();if(b||m?.author_id===me)scrollEnd();return}
    if(m&&m.author_id!==me){unseen++;n.textContent=unseen>99?'99+':unseen;n.hidden=false;
      const priv=m.to_gm||m.to_id;peek.innerHTML=`<b>${esc(m.author_name||H.nameOf(m.author_id))}</b>${priv?' <span class="cw-pv">🔒 лично</span>':''}<div>${esc(m.text.length>140?m.text.slice(0,140)+'…':m.text)}</div>`;
      peek.hidden=false;peek.classList.remove('in');void peek.offsetWidth;peek.classList.add('in');clearTimeout(peekT);peekT=setTimeout(()=>peek.hidden=true,6000)}
  });
  H.ready.then(()=>{opts();if(LS.get('rpa_chat_open')==='1')openP(true)});
  el._off=off;
}
