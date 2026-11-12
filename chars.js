/* RPAssistant — персонажи (общий лист мастера и игрока), броски кубов V5, лента бросков, панель персонажа на карте */

/* ---------- хранилище персонажей и бросков проекта ---------- */
class CharStore{
  constructor(pid,isM){
    this.pid=pid;this.isM=isM;this.list=[];this.rolls=[];this.subs=new Set();this.rollSubs=new Set();this.pending=new Map();this.ready=this.load();
    this.ch=sb.channel('chars:'+pid)
      .on('postgres_changes',{event:'*',schema:'public',table:'characters',filter:`project_id=eq.${pid}`},pl=>this.onRow(pl))
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'dice_rolls',filter:`project_id=eq.${pid}`},pl=>this.onRoll(pl.new,true))
      .subscribe();
  }
  async load(){
    const [{data:c},{data:r}]=await Promise.all([
      sb.from('characters').select('*').eq('project_id',this.pid).order('created_at'),
      sb.from('dice_rolls').select('*').eq('project_id',this.pid).order('created_at',{ascending:false}).limit(60)]);
    this.list=(c||[]).map(x=>({...x,data:{...VTM.blank(),...(x.data||{})}}));this.rolls=(r||[]).reverse();this.emit();
  }
  get(id){return this.list.find(c=>c.id===id)}
  mine(){return this.list.filter(c=>c.owner_id===App.user.id)}
  canEdit(c){return this.isM||c.owner_id===App.user.id}
  on(f){this.subs.add(f);return()=>this.subs.delete(f)}
  onRolls(f){this.rollSubs.add(f);return()=>this.rollSubs.delete(f)}
  emit(id){for(const f of this.subs)try{f(id)}catch(e){console.error(e)}}
  onRow(pl){
    if(pl.eventType==='DELETE'){this.list=this.list.filter(c=>c.id!==pl.old.id);return this.emit()}
    const row=pl.new;if(!row)return;
    if(!this.isM&&row.owner_id!==App.user.id){this.list=this.list.filter(c=>c.id!==row.id);return this.emit()}
    const data={...VTM.blank(),...(row.data||{})};
    for(const sets of (this.pending.get(row.id)||[]))CharStore.apply(data,sets); // не терять свои ещё не подтверждённые правки
    const i=this.list.findIndex(c=>c.id===row.id),c={...row,data};
    if(i<0)this.list.push(c);else{if(row.client===CLIENT_ID&&!(this.pending.get(row.id)||[]).length){this.list[i]={...this.list[i],...row,data:this.list[i].data};return}this.list[i]=c}
    this.emit(row.id);
  }
  static apply(d,sets){for(const [k,v] of Object.entries(sets)){const p=k.split('.');let o=d;for(let i=0;i<p.length-1;i++){if(typeof o[p[i]]!=='object'||!o[p[i]])o[p[i]]={};o=o[p[i]]}if(v===null)delete o[p.at(-1)];else o[p.at(-1)]=v}}
  async patch(id,sets){
    const c=this.get(id);if(!c)return;CharStore.apply(c.data,sets);if(sets.name!==undefined)c.name=sets.name||c.name;this.emit(id);
    const q=this.pending.get(id)||[];q.push(sets);this.pending.set(id,q);
    try{const {error}=await sb.rpc('char_patch',{c:id,sets,cl:CLIENT_ID});if(error)throw error}
    catch(e){fail(e,'Не удалось сохранить изменения персонажа')}
    finally{q.splice(q.indexOf(sets),1)}
  }
  async create(data,{owner=null,npc=false}={}){
    const {data:row,error}=await sb.from('characters').insert({project_id:this.pid,owner_id:owner,created_by:App.user.id,npc,name:data.name||'Безымянный',data,client:CLIENT_ID}).select('*').single();
    if(fail(error))return null;const c={...row,data:{...VTM.blank(),...row.data}};if(!this.get(c.id))this.list.push(c);this.emit(c.id);return c;
  }
  async setOwner(id,owner,npc){const {error}=await sb.from('characters').update({owner_id:owner||null,npc:!!npc}).eq('id',id);if(!fail(error)){const c=this.get(id);c.owner_id=owner||null;c.npc=!!npc;this.emit(id)}}
  async remove(id){const {error}=await sb.from('characters').delete().eq('id',id);if(!fail(error)){this.list=this.list.filter(c=>c.id!==id);this.emit()}}
  async postRoll(data,{charId=null,secret=false}={}){
    const rec={project_id:this.pid,user_id:App.user.id,character_id:charId,secret,map_id:App.mapView?.map.id||null,data:{...data,who:App.user.name}};
    const {data:row,error}=await sb.from('dice_rolls').insert(rec).select('*').single();
    if(fail(error,'Бросок не сохранился'))return null;this.onRoll(row||{...rec,id:uid(),created_at:new Date().toISOString()},false);return row;
  }
  onRoll(r,remote){
    if(!r||this.rolls.some(x=>x.id===r.id))return;this.rolls.push(r);if(this.rolls.length>80)this.rolls.shift();
    for(const f of this.rollSubs)try{f(r)}catch(e){console.error(e)}
    showRollPopup(r);
  }
  destroy(){sb.removeChannel(this.ch);this.subs.clear();this.rollSubs.clear()}
}

/* ---------- броски ---------- */
const DEF_ATTR={athletics:'dex',brawl:'str',craft:'dex',drive:'dex',firearms:'dex',larceny:'dex',melee:'str',stealth:'dex',survival:'wit',animalken:'cha',etiquette:'cha',insight:'wit',intimidation:'cha',leadership:'cha',performance:'cha',persuasion:'cha',streetwise:'cha',subterfuge:'man',academics:'int',awareness:'wit',finance:'int',investigation:'int',medicine:'int',occult:'int',politics:'int',science:'int',technology:'int'};
const QUICK_ROLLS=[['Драка','str','brawl','⚔️'],['Ближний бой','str','melee','🗡️'],['Стрельба','dex','firearms','🔫'],['Уклонение','dex','athletics','💨'],['Восприятие','wit','awareness','👁️'],['Скрытность','dex','stealth','🌫️'],['Убеждение','cha','persuasion','💬'],['Запугивание','cha','intimidation','😠'],['Проницательность','wit','insight','🧠']];
const PHYS=new Set(['str','dex','sta','athletics','brawl','craft','drive','firearms','larceny','melee','stealth','survival']);

function poolOf(c,a,b,{mods=0,spec=false,surge=false}={}){
  const d=c.data,parts=[];let n=0;
  for(const k of [a,b]){if(!k)continue;const v=VTM.val(d,k);parts.push([VTM.traitName(k),v]);n+=v}
  if(b&&b in VTM.DISC){const pb=VTM.bpRow(d)[2];if(pb){parts.push(['Сила крови',pb]);n+=pb}}
  if(spec){parts.push(['Специализация',1]);n+=1}
  if(surge){const s=VTM.bpRow(d)[0];parts.push(['Прилив крови',s]);n+=s}
  const im=VTM.impair(d);if((im.phys&&(PHYS.has(a)||PHYS.has(b)))||(im.mind&&!(PHYS.has(a)||PHYS.has(b)))){parts.push(['Ранения',-2]);n-=2}
  if(mods){parts.push(['Модификатор',mods]);n+=mods}
  return {n:Math.max(1,n),parts};
}

async function rouseCheck(c,{times=1,level=0,why='Пробуждение крови'}={}){
  const S=App.chars;const d=c.data;let hunger=+d.hunger||0;const res=[];const canRe=level&&level<=VTM.bpRow(d)[3];
  if(hunger>=5){toast('Голод 5 — вампир не может пробудить кровь. Это грозит безумием голода.','err');await S.postRoll({type:'rouse',label:why,char:c.name,dice:[],hungerFrom:5,hungerTo:5,blocked:true},{charId:c.id});return false}
  for(let i=0;i<times;i++){let v=VTM.d10(),v2=null;if(v<6&&canRe){v2=VTM.d10();}const ok=v>=6||(v2!==null&&v2>=6);res.push({v,v2,ok});if(!ok)hunger=Math.min(5,hunger+1)}
  const from=+d.hunger||0;if(hunger!==from)await S.patch(c.id,{hunger});
  await S.postRoll({type:'rouse',label:why,char:c.name,dice:res,hungerFrom:from,hungerTo:hunger,reroll:!!canRe},{charId:c.id});
  return true;
}

function openRollDialog(c,pre={}){
  const d=c.data;const S=App.chars;
  const attrOpts=VTM.ATTRS.flatMap(g=>g[2]).map(([k,n])=>`<option value="${k}">${n} (${VTM.val(d,k)})</option>`).join('');
  const discs=Object.keys(VTM.DISC).filter(k=>VTM.val(d,k)>0);
  const bOpts=`<option value="">— без второй черты —</option><optgroup label="Навыки">${VTM.SKILLS.flatMap(g=>g[2]).map(([k,n])=>`<option value="${k}">${n} (${VTM.val(d,k)})</option>`).join('')}</optgroup>${discs.length?`<optgroup label="Дисциплины">${discs.map(k=>`<option value="${k}">${VTM.DISC[k]} (${VTM.val(d,k)})</option>`).join('')}</optgroup>`:''}<optgroup label="Атрибуты">${attrOpts}</optgroup>`;
  const {el,close}=openModal(`<div class="rolldlg"><h3>🎲 ${esc(pre.label||'Бросок')} <small>${esc(c.name)}</small></h3>
    ${pre.vs?`<div class="rd-vs">Против: <b>${esc(pre.vs)}</b></div>`:''}${pre.desc?`<div class="rd-desc">${esc(pre.desc)}</div>`:''}
    <div class="rd-row"><label>Черта 1<select data-a>${attrOpts}</select></label><span class="rd-plus">+</span><label>Черта 2<select data-b>${bOpts}</select></label></div>
    <div class="rd-row rd-opts">
      <label class="rd-num">Модификатор<span><button type="button" data-m="-1">−</button><input data-mods type="number" value="${pre.mods||0}"><button type="button" data-m="1">+</button></span></label>
      <label class="rd-num">Сложность<span><button type="button" data-df="-1">−</button><input data-diff type="number" min="0" max="15" value="${pre.diff??0}"><button type="button" data-df="1">+</button></span></label>
    </div>
    <div class="rd-checks"><label class="ck" data-specw><input type="checkbox" data-spec> Специализация <i data-specn></i> (+1)</label>
      <label class="ck"><input type="checkbox" data-surge> Прилив крови (+${VTM.bpRow(d)[0]}, проверка пробуждения)</label>
      <label class="ck"><input type="checkbox" data-secret> Скрытый бросок (видят только мастера)</label></div>
    <div class="rd-sum"></div>
    <div class="modal-actions"><button class="btn" data-close>Отмена</button><button class="btn primary rd-go" data-go>Бросить</button></div></div>`);
  const A=el.querySelector('[data-a]'),B=el.querySelector('[data-b]'),M=el.querySelector('[data-mods]'),D=el.querySelector('[data-diff]'),SP=el.querySelector('[data-spec]'),SU=el.querySelector('[data-surge]'),SE=el.querySelector('[data-secret]');
  A.value=pre.a||'dex';B.value=pre.b??'';
  if(pre.b&&!B.value)B.value='';
  const upd=()=>{
    const sk=B.value,sp=d.spec?.[sk];const w=el.querySelector('[data-specw]');w.hidden=!sp;el.querySelector('[data-specn]').textContent=sp?`«${sp}»`:'';if(!sp)SP.checked=false;
    const {n,parts}=poolOf(c,A.value,B.value,{mods:+M.value||0,spec:SP.checked,surge:SU.checked});
    const h=Math.min(n,+d.hunger||0);
    el.querySelector('.rd-sum').innerHTML=`<div class="rd-parts">${parts.map(([k,v])=>`<span>${esc(k)} <b>${v>0&&k!==parts[0][0]?'+':''}${v}</b></span>`).join('')}</div>
      <div class="rd-pool"><div class="rd-dice">${Array.from({length:n},(_,i)=>`<i class="${i>=n-h?'h':''}"></i>`).join('')}</div><div><b>${n}</b> ${plural(n,'куб','куба','кубов')}${h?`, из них <b class="hred">${h}</b> ${plural(h,'куб','куба','кубов')} Голода`:''}${+D.value?` · нужно успехов: <b>${D.value}</b>`:''}</div></div>`;
  };
  el.addEventListener('input',upd);el.addEventListener('change',upd);
  el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{M.value=(+M.value||0)+ +b.dataset.m;upd()});
  el.querySelectorAll('[data-df]').forEach(b=>b.onclick=()=>{D.value=Math.max(0,(+D.value||0)+ +b.dataset.df);upd()});
  upd();
  el.querySelector('[data-go]').onclick=async()=>{
    const go=el.querySelector('[data-go]');go.disabled=true;
    if(SU.checked){const ok=await rouseCheck(c,{why:'Прилив крови'});if(!ok){go.disabled=false;return}}
    const cur=S.get(c.id)||c;const {n,parts}=poolOf(cur,A.value,B.value,{mods:+M.value||0,spec:SP.checked,surge:SU.checked});
    const r=VTM.roll({pool:n,hunger:+cur.data.hunger||0,diff:+D.value||0});
    close();
    await S.postRoll({type:'roll',label:pre.label||`${VTM.traitName(A.value)}${B.value?' + '+VTM.traitName(B.value):''}`,char:cur.name,a:A.value,b:B.value,parts,pool:n,hunger:r.hun.length,diff:+D.value||0,reg:r.reg,hun:r.hun,succ:r.succ,res:r.res,margin:r.margin,vs:pre.vs||'',power:pre.power||''},{charId:c.id,secret:SE.checked});
  };
}
function plural(n,a,b,c){n=Math.abs(n)%100;const n1=n%10;if(n>10&&n<20)return c;if(n1>1&&n1<5)return b;if(n1===1)return a;return c}

async function wpReroll(r){
  const S=App.chars,c=S.get(r.character_id);const d=r.data;
  if(!c){toast('Персонаж не найден');return}
  const idx=d.reg.map((v,i)=>[v,i]).filter(([v])=>v<6).slice(0,3).map(([,i])=>i);
  if(!idx.length){toast('Нечего перебрасывать: все обычные кубы — успехи');return}
  const wp={...(c.data.wp||{s:0,a:0})};const max=VTM.wpMax(c.data);
  if(wp.s+wp.a>=max){toast('Сила воли исчерпана','err');return}
  wp.s++;await S.patch(c.id,{wp});
  const reg=[...d.reg];idx.forEach(i=>reg[i]=VTM.d10());
  const sc=VTM.score(reg,d.hun,d.diff);
  await S.postRoll({...d,label:d.label+' · переброс Силой воли',reg,succ:sc.succ,res:sc.res,margin:sc.margin,rerolled:idx,wp:true},{charId:c.id,secret:r.secret});
}

async function usePower(c,pid){
  const p=VTM.POWER[pid];if(!p)return;
  if(p.r){const ok=await rouseCheck(c,{times:p.r,level:p.l,why:`${p.n} (${VTM.DISC[p.disc]} ${p.l})`});if(!ok)return}
  if(p.pool){const [a,b]=p.pool[0];openRollDialog(App.chars.get(c.id)||c,{a,b,label:p.n,vs:p.vs,desc:p.d+(p.pool.length>1?` Другой пул: ${p.pool.slice(1).map(([x,y])=>VTM.traitName(x)+' + '+VTM.traitName(y)).join(', ')}.`:''),power:pid})}
  else await App.chars.postRoll({type:'power',label:p.n,char:c.name,disc:p.disc,lvl:p.l,desc:p.d},{charId:c.id});
}

/* ---------- отображение бросков ---------- */
function diceHTML(d){
  if(d.type==='rouse')return d.blocked?'<span class="rk-note">Голод 5 — кровь не пробуждается</span>':d.dice.map(x=>`<i class="dk h ${x.ok?'ok':'bad'}">${x.v}</i>${x.v2!==null&&x.v2!==undefined?`<i class="dk h re ${x.v2>=6?'ok':'bad'}" title="Переброс за Силу крови">${x.v2}</i>`:''}`).join('');
  if(d.type==='power')return '';
  return [...d.reg.map((v,i)=>`<i class="dk ${v>=6?'ok':''} ${v===10?'ten':''} ${(d.rerolled||[]).includes(i)?'re':''}">${v}</i>`),...d.hun.map(v=>`<i class="dk h ${v>=6?'ok':''} ${v===10?'ten':''} ${v===1?'skull':''}">${v===1?'☠':v}</i>`)].join('');
}
function rollSummary(d){
  if(d.type==='rouse')return d.blocked?['Пробуждение невозможно','#ff4d4d']:d.hungerTo>d.hungerFrom?[`Голод ${d.hungerFrom} → ${d.hungerTo}`,'#ff4d4d']:['Голод не вырос','#7ad08a'];
  if(d.type==='power')return [`${VTM.DISC[d.disc]||''} ${d.lvl||''}`,'#c9b6ff'];
  const [t,col]=VTM.RES[d.res]||['',''];return [`${t} · ${d.succ} ${plural(d.succ,'успех','успеха','успехов')}${d.diff?` из ${d.diff}`:''}${d.margin>0?` (+${d.margin})`:''}`,col];
}
function rollCard(r,full){
  const d=r.data,[sum,col]=rollSummary(d);const mine=r.user_id===App.user.id;
  const canWp=full&&mine&&d.type==='roll'&&!d.wp&&r.character_id&&d.reg.some(v=>v<6);
  return `<div class="rcard ${d.res||d.type}" data-rid="${r.id}"><div class="rc-h"><b>${esc(d.char||d.who||'')}</b>${d.char&&d.who&&!mine?`<span class="rc-who">${esc(d.who)}</span>`:''}${r.secret?'<span class="rc-sec" title="Скрытый бросок">🔒</span>':''}<span class="rc-t">${new Date(r.created_at||Date.now()).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="rc-l">${d.type==='rouse'?'🩸 ':d.type==='power'?(VTM.DISC_ICON[d.disc]||'✨')+' ':'🎲 '}${esc(d.label||'')}</div>${d.vs?`<div class="rc-vs">против ${esc(d.vs)}</div>`:''}
    <div class="rc-d">${diceHTML(d)}</div><div class="rc-r" style="color:${col}">${esc(sum)}</div>${VTM.RES_HINT[d.res]&&full?`<div class="rc-hint">${esc(VTM.RES_HINT[d.res])}</div>`:''}${d.type==='power'&&d.desc?`<div class="rc-hint">${esc(d.desc)}</div>`:''}
    ${canWp?`<button class="btn sm rc-wp" data-wp="${r.id}">Перебросить до 3 кубов за Силу воли</button>`:''}</div>`;
}
function showRollPopup(r){
  if(!App.chars)return;let host=$('.rollpop');if(!host){host=document.createElement('div');host.className='rollpop';document.body.appendChild(host)}
  const w=document.createElement('div');w.className='rp-item';w.innerHTML=rollCard(r,true);host.appendChild(w);
  w.querySelector('[data-wp]')?.addEventListener('click',e=>{e.target.disabled=true;wpReroll(r)});
  requestAnimationFrame(()=>w.classList.add('show'));
  w.querySelectorAll('.dk').forEach((x,i)=>{x.style.animationDelay=(i*45)+'ms'});
  const kill=()=>{w.classList.remove('show');setTimeout(()=>w.remove(),350)};const t=setTimeout(kill,r.user_id===App.user.id?9000:6500);w.onclick=e=>{if(!e.target.closest('button')){clearTimeout(t);kill()}};
  while(host.children.length>3)host.firstElementChild.remove();
}
function mountDiceLog(){
  $('.dicelog')?.remove();if(!App.chars)return;
  const el=document.createElement('div');el.className='dicelog';el.innerHTML=`<button class="dl-btn" title="Журнал бросков">🎲<span class="dl-n" hidden></span></button><div class="dl-panel" hidden><div class="dl-h"><b>Журнал бросков</b><button class="btn ghost sm" data-x>✕</button></div><div class="dl-list"></div></div>`;
  document.body.appendChild(el);const S=App.chars;let unseen=0;
  const list=el.querySelector('.dl-list'),panel=el.querySelector('.dl-panel'),n=el.querySelector('.dl-n');
  const draw=()=>{list.innerHTML=S.rolls.length?S.rolls.slice().reverse().map(r=>rollCard(r,true)).join(''):'<div class="muted" style="padding:16px;font-size:13px">Бросков пока не было. Бросайте кубы из листа персонажа или с карты.</div>'};
  el.querySelector('.dl-btn').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){unseen=0;n.hidden=true;draw()}};
  el.querySelector('[data-x]').onclick=()=>panel.hidden=true;
  list.onclick=e=>{const b=e.target.closest('[data-wp]');if(b){b.disabled=true;wpReroll(S.rolls.find(r=>r.id===b.dataset.wp))}};
  const off=S.onRolls(()=>{if(panel.hidden){unseen++;n.textContent=unseen;n.hidden=false}else draw()});
  S.ready.then(draw);
  el._off=off;
}

/* ---------- элементы листа ---------- */
const dots=(path,v,max=5,ro)=>`<span class="dots ${ro?'ro':''}" data-dots="${path}" data-v="${v}">${Array.from({length:max},(_,i)=>`<i data-d="${i+1}" class="${i<v?'on':''}"></i>`).join('')}</span>`;
function boxes(kind,c){
  const d=c.data;if(kind==='health'||kind==='wp'){const max=kind==='health'?VTM.healthMax(d):VTM.wpMax(d),t=d[kind]||{s:0,a:0};
    return `<span class="boxes" data-box="${kind}">${Array.from({length:max},(_,i)=>`<i data-i="${i}" class="${i<t.a?'agg':i<t.a+t.s?'sup':''}"></i>`).join('')}</span>`}
  if(kind==='humanity'){const h=+d.humanity||0,st=+d.stains||0;return `<span class="boxes hum" data-box="humanity">${Array.from({length:10},(_,i)=>`<i data-i="${i}" class="${i<h?'on':''} ${i>=10-st?'stain':''}"></i>`).join('')}</span>`}
  if(kind==='hunger'){const h=+d.hunger||0;return `<span class="hunger" data-box="hunger">${Array.from({length:5},(_,i)=>`<i data-i="${i}" class="${i<h?'on':''}"></i>`).join('')}</span>`}
}
function cycleBox(c,kind,i){
  const d=c.data;
  if(kind==='hunger'){const h=+d.hunger||0;return {hunger:h===i+1?i:i+1}}
  if(kind==='humanity'){const h=+d.humanity||0;return {humanity:h===i+1?i:i+1}}
  const t={...(d[kind]||{s:0,a:0})},max=kind==='health'?VTM.healthMax(d):VTM.wpMax(d);
  // клик по клетке: пусто → поверхностный → тяжёлый → пусто (для последней заполненной)
  const filled=t.s+t.a;
  if(i>=filled){t.s=Math.min(max-t.a,i+1-t.a)}
  else if(i>=t.a){if(i===filled-1){t.s--;t.a++}else{t.s=i+1-t.a}}
  else{if(i===t.a-1){t.a--}else{t.a=i+1;t.s=Math.min(t.s,max-t.a)}}
  return {[kind]:t};
}
const ownerName=(c,mem)=>c.npc?'Персонаж мастера':c.owner_id?(c.owner_id===App.user.id?'Вы':(mem||[]).find(m=>m.user_id===c.owner_id)?.profile?.name||'Игрок'):'Не назначен';

/* ---------- вкладка «Персонажи» ---------- */
async function renderCharsTab(main,pid,isM){
  const S=App.chars;
  main.innerHTML=`<div class="chars"><aside class="clist"><div class="clist-h"><b>Персонажи</b><button class="btn primary sm" data-new>+ Создать</button></div><div class="cl"></div></aside><section class="csheet"></section></div>`;
  const cl=$('.cl',main),cs=$('.csheet',main);let cur=LS.get('rpa_char_'+pid);let mem=isM?await API.members(pid).catch(()=>[]):[];
  const drawList=()=>{
    const L=S.list;if(cur&&!S.get(cur))cur=null;if(!cur&&L.length)cur=(S.mine()[0]||L[0]).id;
    cl.innerHTML=L.length?L.map(c=>{const d=c.data,cn=VTM.CLANS[d.clan];return `<div class="cli ${c.id===cur?'on':''}" data-id="${c.id}"><div class="cli-av">${esc((c.name||'?').trim()[0]||'?')}</div><div class="cli-b"><b>${esc(c.name)}</b><span>${esc(cn?.n||'Без клана')}${d.predator?' · '+esc(VTM.PREDATORS[d.predator]?.n||''):''}</span><span class="cli-o">${esc(ownerName(c,mem))}</span></div><div class="cli-h" title="Голод">${'●'.repeat(+d.hunger||0)}</div></div>`}).join('')
      :`<div class="muted" style="padding:14px;font-size:13px">${isM?'Создайте персонажей для игроков или NPC.':'У вас пока нет персонажа. Создайте его — мастер сразу увидит лист.'}</div>`;
  };
  const drawSheet=()=>{const c=cur&&S.get(cur);if(!c){cs.innerHTML=`<div class="soon"><div class="panel"><div class="ic">🧛</div><h2>Персонажи</h2><p class="muted">${isM?'Создайте персонажа и назначьте его игроку — или дайте игрокам создать своих. Лист один на двоих: правки игрока сразу видит мастер, а мастер может поправить что угодно.':'Создайте персонажа по правилам Vampire: The Masquerade V5. Мастер увидит лист и сможет его поправить.'}</p><button class="btn primary" data-new>+ Создать персонажа</button></div></div>`;cs.querySelector('[data-new]').onclick=()=>openCharWizard(pid,isM,mem);return}
    renderSheet(cs,c,isM,mem)};
  cl.onclick=e=>{const it=e.target.closest('.cli');if(!it)return;cur=it.dataset.id;LS.set('rpa_char_'+pid,cur);drawList();drawSheet()};
  main.querySelector('[data-new]').onclick=()=>openCharWizard(pid,isM,mem,c=>{cur=c.id;LS.set('rpa_char_'+pid,cur);drawList();drawSheet()});
  let pend=false;
  const off=S.on(id=>{drawList();if(!id||id===cur){const a=document.activeElement;if(a&&cs.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){if(!pend){pend=true;a.addEventListener('blur',()=>{pend=false;setTimeout(()=>{if(cs.isConnected){drawList();drawSheet()}},50)},{once:true})}}else drawSheet()}});
  App.unsub=()=>off();
  await S.ready;drawList();drawSheet();
}

function renderSheet(host,c,isM,mem){
  const S=App.chars,d=c.data,ed=S.canEdit(c),clan=VTM.CLANS[d.clan],bp=VTM.bpRow(d);
  const sel=(k,opts,v)=>`<select data-f="${k}" ${ed?'':'disabled'}>${opts.map(([a,b])=>`<option value="${a}" ${String(a)===String(v)?'selected':''}>${esc(b)}</option>`).join('')}</select>`;
  const inp=(k,v,ph='')=>`<input data-f="${k}" value="${esc(v||'')}" placeholder="${esc(ph)}" ${ed?'':'readonly'}>`;
  const known=(d.powers||[]).map(id=>VTM.POWER[id]).filter(Boolean);
  const discKeys=[...new Set([...(clan?.d||[]),...Object.keys(d.disc||{}).filter(k=>d.disc[k]>0)])];
  const chk=VTM.check(d),bad=chk.filter(x=>!x[0]).length;
  host.innerHTML=`<div class="sheet ${ed?'':'ro'}">
    <div class="sh-top">
      <div class="sh-name"><input class="nm" data-f="name" value="${esc(d.name||c.name)}" placeholder="Имя персонажа" ${ed?'':'readonly'}><div class="sh-sub">${esc(clan?.n||'Клан не выбран')} · ${esc(VTM.GENERATIONS.find(g=>g[0]===+d.gen)?.[1]||'')} поколение · ${esc(ownerName(c,mem))}</div></div>
      <div class="sh-act"><button class="btn primary" data-roll>🎲 Бросок</button><button class="btn" data-rouse title="Проверка пробуждения: d10, на 1–5 Голод растёт">🩸 Пробуждение</button>${isM?`<select data-owner title="Чей персонаж"><option value="">Не назначен</option><option value="npc" ${c.npc?'selected':''}>Персонаж мастера (NPC)</option>${(mem||[]).filter(m=>m.role!=='comaster').map(m=>`<option value="${m.user_id}" ${c.owner_id===m.user_id?'selected':''}>Игрок: ${esc(m.profile?.name||'—')}</option>`).join('')}</select>`:''}${isM||c.created_by===App.user.id?'<button class="btn ghost" data-del title="Удалить персонажа">🗑</button>':''}</div>
    </div>
    <div class="sh-grid info">
      <label>Концепция${inp('concept',d.concept,'Кем был при жизни')}</label>
      <label>Клан${sel('clan',[['','—'],...Object.entries(VTM.CLANS).map(([k,v])=>[k,v.n])],d.clan)}</label>
      <label>Тип хищника${sel('predator',[['','—'],...Object.entries(VTM.PREDATORS).map(([k,v])=>[k,v.n])],d.predator)}</label>
      <label>Поколение${sel('gen',VTM.GENERATIONS.map(([g,n])=>[g,n]),d.gen)}</label>
      <label>Сир${inp('sire',d.sire)}</label><label>Хроника${inp('chronicle',d.chronicle)}</label>
      <label>Амбиция${inp('ambition',d.ambition,'Долгосрочная цель')}</label><label>Желание${inp('desire',d.desire,'Цель на эту сессию')}</label>
    </div>
    <div class="sh-tracks">
      <div class="tr"><span>Здоровье <small>${VTM.healthMax(d)}</small></span>${boxes('health',c)}</div>
      <div class="tr"><span>Сила воли <small>${VTM.wpMax(d)}</small></span>${boxes('wp',c)}</div>
      <div class="tr"><span>Человечность <small>${d.humanity}${d.stains?` · пятна ${d.stains}`:''}</small></span>${boxes('humanity',c)}${ed?`<span class="stn"><button data-stain="-1" title="Убрать пятно">−</button>пятна<button data-stain="1" title="Добавить пятно">+</button></span>`:''}</div>
      <div class="tr"><span>Голод</span>${boxes('hunger',c)}</div>
      <div class="tr"><span>Сила крови <small>прилив +${bp[0]} · лечение ${bp[1]} · бонус ${bp[2]} · проклятие ${bp[4]}</small></span>${dots('bp',+d.bp||0,10,!ed)}</div>
    </div>
    <div class="sh-hint">Клетки здоровья и Силы воли: клик — поверхностный урон (/), ещё клик — тяжёлый (✕). Клик по названию черты — бросок с ней.</div>
    <h3 class="sh-h">Атрибуты</h3>
    <div class="sh-cols">${VTM.ATTRS.map(([g,gn,list])=>`<div><h4>${gn}</h4>${list.map(([k,n])=>`<div class="trait"><button class="tn" data-rt="${k}">${n}</button>${dots('attr.'+k,VTM.val(d,k),5,!ed)}</div>`).join('')}</div>`).join('')}</div>
    <h3 class="sh-h">Навыки</h3>
    <div class="sh-cols">${VTM.SKILLS.map(([g,gn,list])=>`<div><h4>${gn}</h4>${list.map(([k,n])=>`<div class="trait sk"><button class="tn" data-rt="${k}">${n}</button>${dots('skills.'+k,VTM.val(d,k),5,!ed)}${d.spec?.[k]!==undefined&&d.spec?.[k]!==null?`<input class="spec" data-spec="${k}" value="${esc(d.spec[k])}" placeholder="специализация" ${ed?'':'readonly'}>`:ed&&VTM.val(d,k)?`<button class="addspec" data-addspec="${k}" title="Добавить специализацию">+ спец.</button>`:''}</div>`).join('')}</div>`).join('')}</div>
    <h3 class="sh-h">Дисциплины</h3>
    <div class="discs">${discKeys.length?discKeys.map(k=>{const v=VTM.val(d,k),pw=known.filter(p=>p.disc===k);return `<div class="disc"><div class="disc-h"><span class="di">${VTM.DISC_ICON[k]}</span><b>${VTM.DISC[k]}</b>${clan?.d?.includes(k)?'<span class="tag">клановая</span>':''}${dots('disc.'+k,v,5,!ed)}</div>
      <div class="pw">${pw.map(p=>`<button class="pwb" data-pw="${p.id}" title="${esc(p.d)}${p.vs?' Против: '+esc(p.vs):''}"><span class="lv">${p.l}</span>${esc(p.n)}${p.r?`<span class="rc">${'🩸'.repeat(p.r)}</span>`:''}${ed?`<i data-unpw="${p.id}" title="Убрать силу">✕</i>`:''}</button>`).join('')}${ed&&v>0?`<button class="pwb add" data-addpw="${k}">+ сила</button>`:''}</div></div>`}).join(''):'<div class="muted">Выберите клан, чтобы увидеть клановые дисциплины.</div>'}
      ${ed?`<div class="disc-add">${sel('_adddisc',[['','+ Добавить дисциплину…'],...Object.entries(VTM.DISC).filter(([k])=>!discKeys.includes(k)).map(([k,n])=>[k,n])],'')}</div>`:''}</div>
    ${clan?`<div class="bane"><b>Проклятие клана (тяжесть ${VTM.baneSeverity(d)}):</b> ${esc(clan.bane)}<br><b>Компульсия:</b> ${esc(clan.comp)}</div>`:''}
    <div class="sh-two">
      <div><h3 class="sh-h">Достоинства и недостатки</h3><div class="advs">${(d.adv||[]).map((a,i)=>`<div class="adv ${a.flaw?'flaw':''}"><input data-adv="${i}" data-k="n" value="${esc(a.n)}" ${ed?'':'readonly'}>${dots('adv.'+i,+a.dots||0,5,!ed)}${ed?`<button data-advflaw="${i}" title="Достоинство / недостаток">${a.flaw?'Недостаток':'Достоинство'}</button><button data-advdel="${i}" title="Удалить">✕</button>`:`<span class="tag">${a.flaw?'недостаток':''}</span>`}</div>`).join('')}${ed?'<button class="btn sm" data-advadd>+ Добавить</button>':''}</div></div>
      <div><h3 class="sh-h">Убеждения и опоры</h3><div class="convs">${(d.conv||[]).map((v,i)=>`<div class="conv"><input data-conv="${i}" data-k="c" value="${esc(v.c||'')}" placeholder="Убеждение" ${ed?'':'readonly'}><input data-conv="${i}" data-k="t" value="${esc(v.t||'')}" placeholder="Опора — человек, связанный с ним" ${ed?'':'readonly'}>${ed?`<button data-convdel="${i}">✕</button>`:''}</div>`).join('')}${ed&&(d.conv||[]).length<3?'<button class="btn sm" data-convadd>+ Добавить</button>':''}</div></div>
    </div>
    <div class="sh-two"><div><h3 class="sh-h">Внешность и заметки</h3><textarea data-f="notes" rows="5" ${ed?'':'readonly'} placeholder="Внешность, история, связи…">${esc(d.notes||'')}</textarea></div>
      <div><h3 class="sh-h">Опыт</h3><div class="xp"><label>Всего${`<input type="number" data-f="xp.total" value="${+d.xp?.total||0}" ${ed?'':'readonly'}>`}</label><label>Потрачено<input type="number" data-f="xp.spent" value="${+d.xp?.spent||0}" ${ed?'':'readonly'}></label><span>Остаток <b>${(+d.xp?.total||0)-(+d.xp?.spent||0)}</b></span></div>
      <details class="chk" ${bad?'':''}><summary>Проверка по правилам создания V5 ${bad?`<span class="bad">${bad} ${plural(bad,'замечание','замечания','замечаний')}</span>`:'<span class="ok">всё по правилам</span>'}</summary>${chk.map(([ok,t,s])=>`<div class="${ok?'ok':'bad'}">${ok?'✓':'•'} ${esc(t)} <small>${esc(s)}</small></div>`).join('')}</details></div></div>
  </div>`;
  const P=sets=>S.patch(c.id,sets);
  let tm={};const deb=(k,f)=>{clearTimeout(tm[k]);tm[k]=setTimeout(f,450)};
  host.oninput=e=>{if(!ed)return;const t=e.target;
    if(t.dataset.f&&t.tagName!=='SELECT'){const v=t.type==='number'?+t.value||0:t.value;deb(t.dataset.f,()=>P({[t.dataset.f]:v}))}
    if(t.dataset.spec)deb('spec'+t.dataset.spec,()=>P({['spec.'+t.dataset.spec]:t.value.trim()||null}));
    if(t.dataset.adv!==undefined)deb('adv',()=>{const adv=clone(S.get(c.id).data.adv||[]);adv[+t.dataset.adv].n=t.value;P({adv})});
    if(t.dataset.conv!==undefined)deb('conv',()=>{const conv=clone(S.get(c.id).data.conv||[]);conv[+t.dataset.conv][t.dataset.k]=t.value;P({conv})});
  };
  host.onchange=e=>{const t=e.target;
    if(t.dataset.owner!==undefined){const v=t.value;S.setOwner(c.id,v==='npc'||!v?null:v,v==='npc');return}
    if(!ed)return;
    if(t.dataset.f==='_adddisc'&&t.value){P({['disc.'+t.value]:1});return}
    if(t.tagName==='SELECT'&&t.dataset.f){const k=t.dataset.f;let v=t.value;if(k==='gen'){v=+v;P({gen:v})}else P({[k]:v})}
  };
  host.onclick=async e=>{const t=e.target;const cc=S.get(c.id)||c;
    const dt=t.closest('[data-d]');if(dt&&ed){const w=dt.parentElement,path=w.dataset.dots,cur=+w.dataset.v,n=+dt.dataset.d;let v=n===cur?n-1:n;
      if(path.startsWith('attr.'))v=Math.max(1,v);
      if(path.startsWith('adv.')){const adv=clone(cc.data.adv||[]);adv[+path.split('.')[1]].dots=v;return P({adv})}
      if(path.startsWith('disc.')&&v===0)return P({[path]:null,powers:(cc.data.powers||[]).filter(id=>VTM.POWER[id]?.disc!==path.split('.')[1])});
      return P({[path]:path==='bp'?v:v||(path.startsWith('skills.')?null:v)})}
    const bx=t.closest('[data-box] i');if(bx&&ed){return P(cycleBox(cc,bx.parentElement.dataset.box,+bx.dataset.i))}
    if(t.closest('[data-stain]')&&ed){const st=Math.max(0,Math.min(10,(+cc.data.stains||0)+ +t.closest('[data-stain]').dataset.stain));return P({stains:st})}
    const rt=t.closest('[data-rt]');if(rt){const k=rt.dataset.rt;if(k in VTM.ATTR_NAME)openRollDialog(cc,{a:k,b:'',label:VTM.ATTR_NAME[k]});else openRollDialog(cc,{a:DEF_ATTR[k]||'wit',b:k,label:VTM.SKILL_NAME[k]});return}
    if(t.closest('[data-roll]'))return openRollDialog(cc,{a:'dex',b:'athletics'});
    if(t.closest('[data-rouse]'))return rouseCheck(cc);
    const as=t.closest('[data-addspec]');if(as){const k=as.dataset.addspec;as.outerHTML=`<input class="spec" data-spec="${k}" placeholder="специализация, например: Ножи">`;host.querySelector(`[data-spec="${k}"]`).focus();return}
    if(t.closest('[data-unpw]')){e.stopPropagation();const id=t.closest('[data-unpw]').dataset.unpw;return P({powers:(cc.data.powers||[]).filter(x=>x!==id)})}
    if(t.closest('[data-pw]'))return usePower(cc,t.closest('[data-pw]').dataset.pw);
    if(t.closest('[data-addpw]'))return pickPower(cc,t.closest('[data-addpw]').dataset.addpw);
    if(t.closest('[data-advadd]'))return P({adv:[...(cc.data.adv||[]),{n:'',dots:1,flaw:false}]});
    if(t.closest('[data-advdel]')){const adv=clone(cc.data.adv||[]);adv.splice(+t.closest('[data-advdel]').dataset.advdel,1);return P({adv})}
    if(t.closest('[data-advflaw]')){const adv=clone(cc.data.adv||[]);const a=adv[+t.closest('[data-advflaw]').dataset.advflaw];a.flaw=!a.flaw;return P({adv})}
    if(t.closest('[data-convadd]'))return P({conv:[...(cc.data.conv||[]),{c:'',t:''}]});
    if(t.closest('[data-convdel]')){const conv=clone(cc.data.conv||[]);conv.splice(+t.closest('[data-convdel]').dataset.convdel,1);return P({conv})}
    if(t.closest('[data-del]')){if(await confirmBox(`Удалить персонажа «${c.name}»?`))S.remove(c.id)}
  };
}
function pickPower(c,disc,onPick){
  const d=c.data,v=VTM.val(d,disc),have=new Set(d.powers||[]);
  const {el,close}=openModal(`<h3>${VTM.DISC_ICON[disc]} ${VTM.DISC[disc]} — выбор силы</h3><p class="muted" style="margin-top:-6px;font-size:13px">Доступны силы уровня не выше ${v}. По правилам на каждую точку дисциплины берётся одна сила.</p><div class="pwlist">${VTM.POWERS[disc].map(p=>`<button class="pwi ${have.has(p.id)?'on':''}" data-p="${p.id}" ${p.l>v?'disabled':''}><span class="lv">${p.l}</span><div><b>${esc(p.n)}</b>${p.am?` <span class="tag">амальгама: ${esc(p.am)}</span>`:''}<small>${esc(p.d)}${p.pool?` · пул: ${p.pool.map(([a,b])=>VTM.traitName(a)+' + '+VTM.traitName(b)).join(' / ')}`:''}${p.vs?` против ${esc(p.vs)}`:''} · ${p.r?'🩸'.repeat(p.r):'бесплатно'}</small></div></button>`).join('')}</div><div class="modal-actions"><button class="btn" data-close>Готово</button></div>`);
  el.classList.add('wide');
  el.querySelector('.pwlist').onclick=e=>{const b=e.target.closest('[data-p]');if(!b||b.disabled)return;const id=b.dataset.p;
    if(onPick){onPick(id,b);return}
    const cur=App.chars.get(c.id).data.powers||[];const has=cur.includes(id);App.chars.patch(c.id,{powers:has?cur.filter(x=>x!==id):[...cur,id]});b.classList.toggle('on',!has)};
  return {el,close};
}

/* ---------- мастер создания персонажа по правилам V5 ---------- */
const MERITS=[['Ресурсы',false],['Стадо',false],['Контакты',false],['Союзники',false],['Слава',false],['Влияние',false],['Убежище',false],['Маска',false],['Наставник',false],['Статус',false],['Внешность: красота',false],['Железный желудок',false],['Двуязычие',false],['Гули (слуги)',false],['Подозрительный (враг)',true],['Враг',true],['Тёмная тайна',true],['Одержимость',true],['Исключение добычи',true],['Неграмотность',true],['Отвратительный',true],['Без убежища',true],['Нищета',true],['Изгой',true]];
function openCharWizard(pid,isM,mem,onDone){
  const D=VTM.blank();D.age='neonate';let step=0,free=false,owner=isM?'':App.user.id,npc=false,predDisc='',predSpec='';
  const STEPS=['Концепция и клан','Атрибуты','Навыки','Тип хищника','Дисциплины','Достоинства','Убеждения'];
  const {el,close}=openModal(`<div class="wiz"><div class="wz-steps"></div><div class="wz-body"></div><div class="wz-foot"><span class="wz-err"></span><button class="btn" data-back>Назад</button><button class="btn primary" data-next>Далее</button></div></div>`);
  el.classList.add('wide','wizm');
  const body=el.querySelector('.wz-body'),stepsEl=el.querySelector('.wz-steps'),err=el.querySelector('.wz-err');
  const cntA=()=>{const c={};Object.values(D.attr).forEach(v=>c[v]=(c[v]||0)+1);return c};
  const cntS=()=>{const c={};Object.values(D.skills).forEach(v=>{if(v>0)c[v]=(c[v]||0)+1});return c};
  const applyPred=()=>{ // снять старые бонусы хищника и применить новые
    D.adv=D.adv.filter(a=>!a.pred);const p=VTM.PREDATORS[D.predator];D.humanity=7+(VTM.AGES[D.age]?.hum||0);D.bp=VTM.GENERATIONS.find(g=>g[0]===+D.gen)?.[2]??1;
    if(!p)return;D.humanity+=p.hum||0;D.bp+=p.bp||0;p.adv.forEach(([n,dots,flaw])=>D.adv.push({n,dots,flaw,pred:true}));
  };
  const valid=()=>{
    if(free)return '';
    if(step===0){if(!D.name.trim())return 'Введите имя';if(!D.clan)return 'Выберите клан'}
    if(step===1){const a=Object.values(D.attr).sort((x,y)=>y-x);if(JSON.stringify(a)!==JSON.stringify(VTM.ATTR_SPREAD))return 'Распределите атрибуты: 4, 3, 3, 3, 2, 2, 2, 2, 1'}
    if(step===2){const sp=VTM.SKILL_SPREADS[D.spread].d,c=cntS();if(!Object.keys({...sp,...c}).every(k=>(sp[k]||0)===(c[k]||0)))return 'Навыки не соответствуют выбранному распределению'}
    if(step===3){if(!D.predator)return 'Выберите тип хищника';if(!predDisc&&!VTM.CLANS[D.clan]?.thin)return 'Выберите дисциплину от типа хищника';if(!predSpec)return 'Выберите специализацию от типа хищника'}
    if(step===4){const cl=VTM.CLANS[D.clan];if(!cl.thin){const base=Object.entries(D.disc).map(([k,v])=>v-(k===predDisc?1:0)).filter(v=>v>0).sort((a,b)=>b-a);if(JSON.stringify(base)!=='[2,1]')return 'Нужно: одна дисциплина на 2 и одна на 1 (плюс точка хищника)';const tot=Object.values(D.disc).reduce((s,v)=>s+v,0);if(D.powers.length!==tot)return `Выберите силы: ${D.powers.length} из ${tot}`}}
    if(step===5){const ag=VTM.AGES[D.age]||{};const a=D.adv.filter(x=>!x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0),f=D.adv.filter(x=>x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0);if(a!==7+(ag.adv||0))return `Достоинства: нужно ${7+(ag.adv||0)} точек, сейчас ${a}`;if(f!==2+(ag.flaw||0))return `Недостатки: нужно ${2+(ag.flaw||0)}, сейчас ${f}`}
    if(step===6){if(!D.conv.length||D.conv.some(c=>!c.c.trim()))return 'Добавьте от 1 до 3 убеждений'}
    return '';
  };
  const ATTR_ROWS=()=>{const c=cntA(),need={4:1,3:3,2:4,1:1};return `<div class="wz-cnt">${[4,3,2,1].map(v=>`<span class="${(c[v]||0)===need[v]?'ok':(c[v]||0)>need[v]?'over':''}">на ${v}: ${c[v]||0}/${need[v]}</span>`).join('')}</div><div class="sh-cols">${VTM.ATTRS.map(([g,gn,l])=>`<div><h4>${gn}</h4>${l.map(([k,n])=>`<div class="trait"><span class="tn">${n}</span><span class="seg">${[1,2,3,4,5].map(v=>`<button data-attr="${k}" data-v="${v}" class="${D.attr[k]===v?'on':''}">${v}</button>`).join('')}</span></div>`).join('')}</div>`).join('')}</div>`};
  const draw=()=>{
    stepsEl.innerHTML=STEPS.map((s,i)=>`<span class="${i===step?'on':i<step?'done':''}" data-go="${i}">${i+1}. ${s}</span>`).join('');
    el.querySelector('[data-back]').style.visibility=step?'visible':'hidden';el.querySelector('[data-next]').textContent=step===STEPS.length-1?'Создать персонажа':'Далее';err.textContent='';
    let h='';
    if(step===0)h=`<div class="wz-g2"><label class="f">Имя<input data-w="name" value="${esc(D.name)}" placeholder="Как вас зовут сородичи"></label><label class="f">Концепция<input data-w="concept" value="${esc(D.concept)}" placeholder="Например: детектив, потерявший веру"></label></div>
      ${isM?`<label class="f">Чей персонаж<select data-owner><option value="">Пока без игрока</option><option value="npc" ${npc?'selected':''}>Персонаж мастера (NPC)</option>${(mem||[]).filter(m=>m.role!=='comaster').map(m=>`<option value="${m.user_id}" ${owner===m.user_id?'selected':''}>${esc(m.profile?.name||'Игрок')}</option>`).join('')}</select></label>`:''}
      <div class="f">Клан</div><div class="clans">${Object.entries(VTM.CLANS).map(([k,v])=>`<button class="clan ${D.clan===k?'on':''}" data-clan="${k}"><b>${esc(v.n)}</b><small>${v.any?'любые две дисциплины':v.d.map(x=>VTM.DISC_ICON[x]+' '+VTM.DISC[x]).join(', ')}</small></button>`).join('')}</div>
      ${D.clan?`<div class="bane"><b>Проклятие:</b> ${esc(VTM.CLANS[D.clan].bane)}</div>`:''}
      <div class="f">Время обращения (Море времени)</div><div class="ages">${Object.entries(VTM.AGES).map(([k,v])=>`<label class="pre"><input type="radio" name="age" value="${k}" ${D.age===k?'checked':''}><span><b>${v.n.split(' — ')[0]}</b><small>${v.n.split(' — ')[1]}${v.xp?` · +${v.xp} опыта`:''}</small></span></label>`).join('')}</div>
      <label class="f">Поколение<select data-gen>${VTM.GENERATIONS.filter(([g])=>VTM.CLANS[D.clan]?.thin?g>=14:g<14&&g>=10).map(([g,n,bp])=>`<option value="${g}" ${+D.gen===g?'selected':''}>${n} · Сила крови ${bp}</option>`).join('')}</select></label>
      <label class="ck"><input type="checkbox" data-free ${free?'checked':''}> Свободное создание (без проверки правил — для готовых или особых персонажей)</label>`;
    if(step===1)h=`<p class="muted wz-p">Один атрибут на 4, три на 3, четыре на 2, один на 1. Здоровье = Выносливость + 3, Сила воли = Самообладание + Решимость.</p>${ATTR_ROWS()}<div class="wz-calc">Здоровье: <b>${VTM.healthMax(D)}</b> · Сила воли: <b>${VTM.wpMax(D)}</b></div>`;
    if(step===2){const sp=VTM.SKILL_SPREADS[D.spread].d,c=cntS();h=`<div class="spreads">${Object.entries(VTM.SKILL_SPREADS).map(([k,v])=>`<label class="pre"><input type="radio" name="spread" value="${k}" ${D.spread===k?'checked':''}><span><b>${v.name}</b><small>${v.hint}</small></span></label>`).join('')}</div>
      <div class="wz-cnt">${Object.keys(sp).sort((a,b)=>b-a).map(v=>`<span class="${(c[v]||0)===sp[v]?'ok':(c[v]||0)>sp[v]?'over':''}">на ${v}: ${c[v]||0}/${sp[v]}</span>`).join('')}</div>
      <div class="sh-cols">${VTM.SKILLS.map(([g,gn,l])=>`<div><h4>${gn}</h4>${l.map(([k,n])=>`<div class="trait sk"><span class="tn">${n}</span><span class="seg">${[0,1,2,3,4].map(v=>`<button data-skill="${k}" data-v="${v}" class="${(D.skills[k]||0)===v?'on':''}">${v||'–'}</button>`).join('')}</span>${(VTM.FREE_SPEC_SKILLS.includes(k)&&D.skills[k])?`<input class="spec" data-wspec="${k}" value="${esc(D.spec[k]||'')}" placeholder="обязательная специализация">`:''}</div>`).join('')}</div>`).join('')}</div>
      <label class="f" style="margin-top:12px">Ещё одна бесплатная специализация<span class="wz-g2"><select data-xspec><option value="">Навык…</option>${Object.entries(D.skills).filter(([,v])=>v>0).map(([k])=>`<option value="${k}" ${D._xs===k?'selected':''}>${VTM.SKILL_NAME[k]}</option>`).join('')}</select><input data-xspecv value="${esc(D._xs?D.spec[D._xs]||'':'')}" placeholder="Например: Ножи"></span></label>`}
    if(step===3)h=`<p class="muted wz-p">Тип хищника — как персонаж добывает кровь. Даёт специализацию, точку дисциплины и достоинства/недостатки.</p><div class="preds">${Object.entries(VTM.PREDATORS).map(([k,p])=>`<button class="pred ${D.predator===k?'on':''}" data-pred="${k}" ${k==='bagger'&&D.clan==='ventrue'?'disabled':''}><b>${p.n}</b><small>Охота: ${VTM.traitName(p.pool[0])} + ${VTM.traitName(p.pool[1])}${p.hum?` · Человечность ${p.hum>0?'+':''}${p.hum}`:''}${p.bp?' · Сила крови +1':''}</small><small>${p.adv.map(a=>(a[2]?'− ':'+ ')+a[0]+' '+'●'.repeat(a[1])).join('<br>')}</small></button>`).join('')}</div>
      ${D.predator?(()=>{const p=VTM.PREDATORS[D.predator];const cl=VTM.CLANS[D.clan];const dd=p.disc.filter(x=>x!=='bloodsorcery'||D.clan==='tremere'||D.clan==='banuhaqim');return `<div class="wz-g2"><label class="f">Специализация<select data-pspec><option value="">—</option>${p.spec.map(([s,n],i)=>`<option value="${i}" ${predSpec===String(i)?'selected':''}>${VTM.SKILL_NAME[s]} (${n})</option>`).join('')}</select></label>${cl?.thin?'':`<label class="f">Точка дисциплины<select data-pdisc><option value="">—</option>${dd.map(x=>`<option value="${x}" ${predDisc===x?'selected':''}>${VTM.DISC[x]}</option>`).join('')}</select></label>`}</div>`})():''}`;
    if(step===4){const cl=VTM.CLANS[D.clan];const pool=cl.any?Object.keys(VTM.DISC).filter(k=>k!=='alchemy'):cl.d;
      h=cl.thin?`<p class="muted wz-p">У слабой крови нет врождённых дисциплин. Алхимию слабой крови можно взять через достоинства.</p>`:`<p class="muted wz-p">${cl.any?'Каитифф выбирает любые две дисциплины':'Выберите две клановые дисциплины'}: одну на 2, другую на 1.${predDisc?` Точка от хищника: ${VTM.DISC[predDisc]} +1.`:''} На каждую точку — одна сила уровня не выше рейтинга.</p>
      <div class="wdiscs">${[...new Set([...pool,...(predDisc?[predDisc]:[])])].map(k=>{const base=(D.disc[k]||0)-(k===predDisc?1:0);return `<div class="wdisc"><div class="disc-h"><span class="di">${VTM.DISC_ICON[k]}</span><b>${VTM.DISC[k]}</b><span class="seg">${(pool.includes(k)?[0,1,2]:[0]).map(v=>`<button data-wd="${k}" data-v="${v}" class="${base===v?'on':''}">${v}</button>`).join('')}</span>${k===predDisc?'<span class="tag">+1 хищник</span>':''}</div>${D.disc[k]?`<div class="pw">${D.powers.filter(id=>VTM.POWER[id].disc===k).map(id=>`<span class="pwb">${VTM.POWER[id].l} · ${esc(VTM.POWER[id].n)}<i data-wunpw="${id}">✕</i></span>`).join('')}${D.powers.filter(id=>VTM.POWER[id].disc===k).length<D.disc[k]?`<button class="pwb add" data-wpw="${k}">+ сила</button>`:''}</div>`:''}</div>`}).join('')}</div>`}
    if(step===5){const ag=VTM.AGES[D.age]||{};const a=D.adv.filter(x=>!x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0),f=D.adv.filter(x=>x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0);
      h=`<p class="muted wz-p">Потратьте ${7+(ag.adv||0)} точек на достоинства и возьмите ${2+(ag.flaw||0)} точки недостатков — сверх тех, что дал тип хищника.</p><div class="wz-cnt"><span class="${a===7+(ag.adv||0)?'ok':a>7+(ag.adv||0)?'over':''}">достоинства ${a}/${7+(ag.adv||0)}</span><span class="${f===2+(ag.flaw||0)?'ok':f>2+(ag.flaw||0)?'over':''}">недостатки ${f}/${2+(ag.flaw||0)}</span></div>
      <div class="advs">${D.adv.map((x,i)=>`<div class="adv ${x.flaw?'flaw':''}"><input data-wadv="${i}" value="${esc(x.n)}" ${x.pred?'readonly':''}><span class="seg">${[1,2,3,4,5].map(v=>`<button data-wadvd="${i}" data-v="${v}" class="${x.dots===v?'on':''}" ${x.pred?'disabled':''}>${v}</button>`).join('')}</span>${x.pred?'<span class="tag">хищник</span>':`<button data-wadvdel="${i}">✕</button>`}</div>`).join('')}</div>
      <div class="chips">${MERITS.map(([n,fl],i)=>`<button class="chip ${fl?'fl':''}" data-merit="${i}">${fl?'− ':'+ '}${esc(n)}</button>`).join('')}<button class="chip" data-merit="-1">+ Своё…</button><button class="chip fl" data-merit="-2">− Свой недостаток…</button></div>`}
    if(step===6)h=`<p class="muted wz-p">Убеждения — моральные принципы; к каждому — опора, живой человек, связанный с ним. Человечность: <b>${D.humanity}</b>.</p>
      <div class="convs">${D.conv.map((v,i)=>`<div class="conv"><input data-wconv="${i}" data-k="c" value="${esc(v.c)}" placeholder="Убеждение"><input data-wconv="${i}" data-k="t" value="${esc(v.t)}" placeholder="Опора"><button data-wconvdel="${i}">✕</button></div>`).join('')}${D.conv.length<3?'<button class="btn sm" data-wconvadd>+ Убеждение</button>':''}</div>
      <div class="wz-g2" style="margin-top:12px"><label class="f">Амбиция<input data-w="ambition" value="${esc(D.ambition)}" placeholder="Долгосрочная цель"></label><label class="f">Желание<input data-w="desire" value="${esc(D.desire)}" placeholder="Сиюминутная цель"></label></div>
      <label class="f">Сир<input data-w="sire" value="${esc(D.sire)}"></label>
      <div class="chk">${VTM.check(D).map(([ok,t,s])=>`<div class="${ok?'ok':'bad'}">${ok?'✓':'•'} ${esc(t)} <small>${esc(s)}</small></div>`).join('')}</div>`;
    body.innerHTML=h;
  };
  el.addEventListener('input',e=>{const t=e.target;
    if(t.dataset.w!==undefined)D[t.dataset.w]=t.value;
    if(t.dataset.wspec)D.spec[t.dataset.wspec]=t.value;
    if(t.dataset.xspecv!==undefined&&D._xs)D.spec[D._xs]=t.value;
    if(t.dataset.wadv!==undefined)D.adv[+t.dataset.wadv].n=t.value;
    if(t.dataset.wconv!==undefined)D.conv[+t.dataset.wconv][t.dataset.k]=t.value;
  });
  el.addEventListener('change',e=>{const t=e.target;
    if(t.name==='age'){D.age=t.value;const g=VTM.AGES[t.value].gen[0];if(!VTM.CLANS[D.clan]?.thin)D.gen=g;applyPred();draw()}
    if(t.dataset.gen!==undefined){D.gen=+t.value;applyPred();draw()}
    if(t.dataset.free!==undefined){free=t.checked}
    if(t.dataset.owner!==undefined){npc=t.value==='npc';owner=npc?'':t.value}
    if(t.name==='spread'){D.spread=t.value;draw()}
    if(t.dataset.xspec!==undefined){if(D._xs&&D._xs!==t.value)delete D.spec[D._xs];D._xs=t.value;draw()}
    if(t.dataset.pspec!==undefined){const p=VTM.PREDATORS[D.predator];if(predSpec!==''){const [s]=p.spec[+predSpec];if(D.spec[s]===p.spec[+predSpec][1])delete D.spec[s]}predSpec=t.value;if(t.value!==''){const [s,n]=p.spec[+t.value];D.spec[s]=n;if(!D.skills[s]&&!free)toast(`Специализация «${n}» сработает, если вложить хотя бы 1 точку в «${VTM.SKILL_NAME[s]}»`)}}
    if(t.dataset.pdisc!==undefined){if(predDisc){D.disc[predDisc]=(D.disc[predDisc]||1)-1;if(!D.disc[predDisc])delete D.disc[predDisc];trimPowers()}predDisc=t.value;if(predDisc)D.disc[predDisc]=(D.disc[predDisc]||0)+1}
  });
  const trimPowers=()=>{for(const k of Object.keys(VTM.DISC)){const mine=D.powers.filter(id=>VTM.POWER[id].disc===k);const lim=D.disc[k]||0;mine.filter(id=>VTM.POWER[id].l>lim).forEach(id=>D.powers.splice(D.powers.indexOf(id),1));let m=D.powers.filter(id=>VTM.POWER[id].disc===k);while(m.length>lim){D.powers.splice(D.powers.indexOf(m.pop()),1)}}};
  el.addEventListener('click',e=>{const t=e.target.closest('button,[data-go]');if(!t)return;
    if(t.dataset.go!==undefined&&t.tagName==='SPAN'){const to=+t.dataset.go;if(to<step||free){step=to;draw()}return}
    if(t.dataset.clan){if(D.clan!==t.dataset.clan){D.clan=t.dataset.clan;D.disc={};D.powers=[];predDisc='';if(VTM.CLANS[D.clan].thin)D.gen=14;else if(D.gen>13)D.gen=VTM.AGES[D.age].gen[0];applyPred()}draw();return}
    if(t.dataset.attr){D.attr[t.dataset.attr]=+t.dataset.v;draw();return}
    if(t.dataset.skill){const v=+t.dataset.v;if(v)D.skills[t.dataset.skill]=v;else{delete D.skills[t.dataset.skill];}draw();return}
    if(t.dataset.pred){if(predDisc){D.disc[predDisc]--;if(!D.disc[predDisc])delete D.disc[predDisc];predDisc=''}if(predSpec!==''){const p=VTM.PREDATORS[D.predator];const [s,n]=p.spec[+predSpec];if(D.spec[s]===n)delete D.spec[s];predSpec=''}D.predator=t.dataset.pred;applyPred();trimPowers();draw();return}
    if(t.dataset.wd){const k=t.dataset.wd,v=+t.dataset.v;const extra=k===predDisc?1:0;if(v+extra)D.disc[k]=v+extra;else delete D.disc[k];trimPowers();draw();return}
    if(t.dataset.wpw){const k=t.dataset.wpw;const m=pickPower({data:D},k,(id,b)=>{if(D.powers.includes(id)){D.powers.splice(D.powers.indexOf(id),1);b.classList.remove('on')}else if(D.powers.filter(x=>VTM.POWER[x].disc===k).length<(D.disc[k]||0)){D.powers.push(id);b.classList.add('on')}else toast('Сил уже столько, сколько точек дисциплины');draw()});return}
    if(t.dataset.wunpw){D.powers.splice(D.powers.indexOf(t.dataset.wunpw),1);draw();return}
    if(t.dataset.merit!==undefined){const i=+t.dataset.merit;D.adv.push(i>=0?{n:MERITS[i][0],dots:1,flaw:MERITS[i][1]}:{n:'',dots:1,flaw:i===-2});draw();return}
    if(t.dataset.wadvd!==undefined){D.adv[+t.dataset.wadvd].dots=+t.dataset.v;draw();return}
    if(t.dataset.wadvdel!==undefined){D.adv.splice(+t.dataset.wadvdel,1);draw();return}
    if(t.dataset.wconvadd!==undefined){D.conv.push({c:'',t:''});draw();return}
    if(t.dataset.wconvdel!==undefined){D.conv.splice(+t.dataset.wconvdel,1);draw();return}
    if(t.dataset.back!==undefined){step=Math.max(0,step-1);draw();return}
    if(t.dataset.next!==undefined){const er=valid();if(er){err.textContent=er;return}
      if(step<STEPS.length-1){step++;if(step===1&&Object.values(D.attr).every(v=>v===1))D.attr={str:2,dex:2,sta:2,cha:2,man:2,com:2,int:2,wit:2,res:2};draw();return}
      finish();return}
  });
  const finish=async()=>{
    const data=clone(D);delete data._xs;data.adv=data.adv.filter(a=>a.n.trim());data.adv.forEach(a=>delete a.pred);
    for(const k of Object.keys(data.spec))if(!data.spec[k]||!data.skills[k])delete data.spec[k];
    data.hunger=1;data.xp={total:VTM.AGES[D.age]?.xp||0,spent:0};
    if(!isM){owner=App.user.id;npc=false}
    const btn=el.querySelector('[data-next]');btn.disabled=true;
    const c=await App.chars.create(data,{owner:owner||null,npc});btn.disabled=false;
    if(c){close();toast(`Персонаж «${c.name}» создан`);onDone?.(c)}
  };
  applyPred();draw();
}

/* ---------- панель персонажа на карте ---------- */
function mountMapCharPanel(mv){
  const S=App.chars;if(!S)return;
  const wrap=mv.host.querySelector('.mapwrap');const el=document.createElement('div');el.className='mchar';wrap.appendChild(el);
  let cur=LS.get('rpa_mchar_'+mv.ctx.pid),open=LS.get('rpa_mchar_open')!=='0';
  const pick=()=>{const own=S.mine(),all=S.isM?S.list:own;if(!all.some(c=>c.id===cur))cur=(own[0]||all[0])?.id||null;return all};
  const draw=()=>{
    const all=pick(),c=cur&&S.get(cur);
    if(!all.length){el.innerHTML=S.isM?'':`<div class="mc-empty">🧛 Создайте персонажа во вкладке «Персонажи», чтобы бросать кубы и применять силы прямо здесь.</div>`;return}
    const d=c.data,known=(d.powers||[]).map(id=>VTM.POWER[id]).filter(Boolean);
    el.innerHTML=`<div class="mc-h"><button class="mc-tg" data-tg title="${open?'Свернуть':'Развернуть'}">${open?'▾':'▸'}</button>${all.length>1?`<select data-mc>${all.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`:`<b>${esc(c.name)}</b>`}<span class="mc-hun" title="Голод">${boxes('hunger',c)}</span></div>
    ${open?`<div class="mc-b"><div class="mc-tr"><span title="Здоровье">❤</span>${boxes('health',c)}</div><div class="mc-tr"><span title="Сила воли">✦</span>${boxes('wp',c)}</div>
      <div class="mc-q">${QUICK_ROLLS.map(([n,a,b,ic])=>`<button data-q="${a}|${b}|${n}" title="${VTM.ATTR_NAME[a]} + ${VTM.SKILL_NAME[b]} = ${VTM.val(d,a)+VTM.val(d,b)}"><span>${ic}</span>${n}<b>${VTM.val(d,a)+VTM.val(d,b)}</b></button>`).join('')}</div>
      ${known.length?`<div class="mc-l">Силы</div><div class="mc-p">${known.map(p=>`<button data-pw="${p.id}" title="${esc(p.d)}${p.vs?' · против '+esc(p.vs):''}"><span>${VTM.DISC_ICON[p.disc]}</span>${esc(p.n)}${p.r?`<i>${'🩸'.repeat(p.r)}</i>`:''}</button>`).join('')}</div>`:''}
      <div class="mc-f"><button class="btn sm" data-rouse>🩸 Пробуждение</button><button class="btn primary sm" data-roll>🎲 Свой бросок</button></div></div>`:''}`;
  };
  el.onclick=e=>{const t=e.target;const c=cur&&S.get(cur);
    if(t.closest('[data-tg]')){open=!open;LS.set('rpa_mchar_open',open?'1':'0');return draw()}
    if(!c)return;
    const bx=t.closest('[data-box] i');if(bx&&S.canEdit(c))return S.patch(c.id,cycleBox(c,bx.parentElement.dataset.box,+bx.dataset.i));
    const q=t.closest('[data-q]');if(q){const [a,b,n]=q.dataset.q.split('|');return openRollDialog(c,{a,b,label:n})}
    const pw=t.closest('[data-pw]');if(pw)return usePower(c,pw.dataset.pw);
    if(t.closest('[data-rouse]'))return rouseCheck(c);
    if(t.closest('[data-roll]'))return openRollDialog(c,{a:'dex',b:'athletics'});
  };
  el.onchange=e=>{if(e.target.dataset.mc!==undefined){cur=e.target.value;LS.set('rpa_mchar_'+mv.ctx.pid,cur);draw()}};
  el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation());
  const off=S.on(()=>draw());S.ready.then(draw);
  return ()=>{off();el.remove()};
}
