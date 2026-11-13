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
const QUICK_ROLLS=[['Драка','str','brawl','⚔️'],['Фехтование','str','melee','🗡️'],['Стрельба','dex','firearms','🔫'],['Уклонение','dex','athletics','💨'],['Восприятие','wit','awareness','👁️'],['Скрытность','dex','stealth','🌫️'],['Убеждение','cha','persuasion','💬'],['Запугивание','cha','intimidation','😠'],['Проницательность','wit','insight','🧠']];
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

/* имя «до знакомства»: пока мастер не открыл имя, игроки видят только alias */
function charHidden(c){const d=c?.data||{};return !!(d.alias&&String(d.alias).trim()&&!d.revealed)}
function charPubName(c){return charHidden(c)?String(c.data.alias).trim():(c?.name||'')}
function charName(c){if(!c)return '';const S=App.chars;if(!charHidden(c)||S?.isM||c.owner_id===App.user?.id)return c.name;return charPubName(c)}
async function rouseCheck(c,{times=1,level=0,why='Бросок на голод'}={}){
  const S=App.chars;const d=c.data;let hunger=+d.hunger||0;const res=[];const canRe=level&&level<=VTM.bpRow(d)[3];
  if(hunger>=5){toast('Голод 5 — вампир не может пробудить кровь. Это грозит безумием голода.','err');await S.postRoll({type:'rouse',label:why,char:charPubName(c),dice:[],hungerFrom:5,hungerTo:5,blocked:true},{charId:c.id});return false}
  for(let i=0;i<times;i++){let v=VTM.d10(),v2=null;if(v<6&&canRe){v2=VTM.d10();}const ok=v>=6||(v2!==null&&v2>=6);res.push({v,v2,ok});if(!ok)hunger=Math.min(5,hunger+1)}
  const from=+d.hunger||0;if(hunger!==from)await S.patch(c.id,{hunger});
  await S.postRoll({type:'rouse',label:why,char:charPubName(c),dice:res,hungerFrom:from,hungerTo:hunger,reroll:!!canRe},{charId:c.id});
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
      <label class="ck"><input type="checkbox" data-surge> Прилив крови (+${VTM.bpRow(d)[0]}, бросок на голод)</label>
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
  if(wp.s+wp.a>=max){toast('Воля исчерпана','err');return}
  wp.s++;await S.patch(c.id,{wp});
  const reg=[...d.reg];idx.forEach(i=>reg[i]=VTM.d10());
  const sc=VTM.score(reg,d.hun,d.diff);
  await S.postRoll({...d,label:d.label+' · переброс за Волю',reg,succ:sc.succ,res:sc.res,margin:sc.margin,rerolled:idx,wp:true},{charId:c.id,secret:r.secret});
}

async function usePower(c,pid){
  const p=VTM.POWER[pid];if(!p)return;
  if(p.r){const ok=await rouseCheck(c,{times:p.r,level:p.l,why:`${p.n} (${VTM.DISC[p.disc]} ${p.l})`});if(!ok)return}
  if(p.pool){const [a,b]=p.pool[0];openRollDialog(App.chars.get(c.id)||c,{a,b,label:p.n,vs:p.vs,desc:`${p.en}${p.d?' — '+p.d:''}${p.pool.length>1?` Другой пул: ${p.pool.slice(1).map(([x,y])=>VTM.traitName(x)+' + '+VTM.traitName(y)).join(', ')}.`:''} · ${VTM.srcText(p.src)}`,power:pid})}
  else await App.chars.postRoll({type:'power',label:p.n,char:charPubName(c),disc:p.disc,lvl:p.l,desc:p.d||p.en},{charId:c.id});
}

/* ---------- отображение бросков ---------- */
function diceHTML(d){
  if(d.type==='rouse')return d.blocked?'<span class="rk-note">Голод 5 — кровь не пробуждается</span>':d.dice.map(x=>`<i class="dk h ${x.ok?'ok':'bad'}">${x.v}</i>${x.v2!==null&&x.v2!==undefined?`<i class="dk h re ${x.v2>=6?'ok':'bad'}" title="Переброс за Силу крови">${x.v2}</i>`:''}`).join('');
  if(d.type==='power')return '';
  return [...d.reg.map((v,i)=>`<i class="dk ${v>=6?'ok':''} ${v===10?'ten':''} ${(d.rerolled||[]).includes(i)?'re':''}">${v}</i>`),...d.hun.map(v=>`<i class="dk h ${v>=6?'ok':''} ${v===10?'ten':''} ${v===1?'skull':''}">${v===1?'☠':v}</i>`)].join('');
}
function rollSummary(d){
  if(d.type==='rouse')return d.blocked?['Кровь не пробуждается','#ff4d4d']:d.hungerTo>d.hungerFrom?[`Голод ${d.hungerFrom} → ${d.hungerTo}`,'#ff4d4d']:['Голод не вырос','#7ad08a'];
  if(d.type==='power')return [`${VTM.DISC[d.disc]||''} ${d.lvl||''}`,'#c9b6ff'];
  const [t,col]=VTM.RES[d.res]||['',''];return [`${t} · ${d.succ} ${plural(d.succ,'успех','успеха','успехов')}${d.diff?` из ${d.diff}`:''}${d.margin>0?` (+${d.margin})`:''}`,col];
}
// чужие броски игрок видит без своих данных о листе: только кто, что и чем кончилось — без кубов (их число выдаёт пул) и без значений Голода
function seesRoll(r){const S=App.chars;if(!S||S.isM||r.user_id===App.user.id)return true;const c=r.character_id&&S.get(r.character_id);return !!(c&&c.owner_id===App.user.id)}
function rollCard(r,full){
  const open=seesRoll(r);const d=open?r.data:{...r.data,parts:undefined,pool:undefined,hunger:undefined,hungerFrom:undefined,hungerTo:undefined,margin:0};
  let [sum,col]=rollSummary(r.data);if(!open&&r.data.type==='rouse')sum=r.data.blocked?'Бросок на голод невозможен':r.data.hungerTo>r.data.hungerFrom?'Голод вырос':'Голод не вырос';
  if(!open&&r.data.type==='roll'){const [t]=VTM.RES[r.data.res]||[''];sum=t}
  const mine=r.user_id===App.user.id;
  const canWp=full&&mine&&d.type==='roll'&&!d.wp&&r.character_id&&d.reg.some(v=>v<6);
  return `<div class="rcard ${d.res||d.type}" data-rid="${r.id}"><div class="rc-h"><b>${esc((r.character_id&&App.chars?.get(r.character_id)?charName(App.chars.get(r.character_id)):d.char)||d.who||'')}</b>${d.char&&d.who&&!mine?`<span class="rc-who">${esc(d.who)}</span>`:''}${r.secret?'<span class="rc-sec" title="Скрытый бросок">🔒</span>':''}<span class="rc-t">${new Date(r.created_at||Date.now()).toLocaleTimeString(I18N.loc,{hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="rc-l">${d.type==='rouse'?'🩸 ':d.type==='power'?(VTM.DISC_ICON[d.disc]||'✨')+' ':'🎲 '}${esc(d.label||'')}</div>${d.vs?`<div class="rc-vs">против ${esc(d.vs)}</div>`:''}
    ${open?`<div class="rc-d">${diceHTML(d)}</div>`:""}<div class="rc-r" style="color:${col}">${esc(sum)}</div>${VTM.RES_HINT[d.res]&&full?`<div class="rc-hint">${esc(VTM.RES_HINT[d.res])}</div>`:''}${d.type==='power'&&d.desc?`<div class="rc-hint">${esc(d.desc)}</div>`:''}
    ${canWp?`<button class="btn sm rc-wp" data-wp="${r.id}">Перебросить до 3 кубов за Волю</button>`:''}</div>`;
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
/* плавающее окно: перетаскивание за заголовок, размер — за правый нижний угол, позиция запоминается */
function floatPanel(panel,head,key){
  const K='rpa_fp_'+key;let st=null;try{st=JSON.parse(LS.get(K)||'null')}catch(_){st=null}
  panel.classList.add('fp');head.classList.add('fp-h');
  if(!head.title)head.title='Перетащите, чтобы передвинуть · двойной щелчок — вернуть на место';
  const save=()=>LS.set(K,st?JSON.stringify(st):null);
  const apply=()=>{
    if(st&&st.w){panel.style.width=st.w+'px';panel.style.height=st.h+'px';panel.style.maxHeight='none'}else{panel.style.width=panel.style.height=panel.style.maxHeight=''}
    if(st&&st.x!=null){const W=innerWidth,H=innerHeight,w=panel.offsetWidth||320,h=panel.offsetHeight||200;
      panel.style.position='fixed';panel.style.left=Math.max(0,Math.min(W-Math.min(w,W),st.x))+'px';panel.style.top=Math.max(0,Math.min(H-Math.min(h,H),st.y))+'px';panel.style.bottom='auto';panel.style.right='auto'}
    else{panel.style.position=panel.style.left=panel.style.top=panel.style.bottom=panel.style.right=''}};
  let dr=null,rs=false;
  head.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,select,input,textarea,a'))return;
    const r=panel.getBoundingClientRect();dr={dx:e.clientX-r.left,dy:e.clientY-r.top};head.setPointerCapture(e.pointerId);panel.classList.add('fp-drag');e.preventDefault()});
  head.addEventListener('pointermove',e=>{if(!dr)return;st={...(st||{}),x:e.clientX-dr.dx,y:e.clientY-dr.dy};apply()});
  const end=()=>{if(!dr)return;dr=null;panel.classList.remove('fp-drag');save()};
  head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
  head.addEventListener('dblclick',e=>{if(e.target.closest('button,select,input'))return;st=null;save();apply()});
  // изменение размера: нативный уголок (resize:both); запоминаем после отпускания
  panel.addEventListener('pointerdown',e=>{const r=panel.getBoundingClientRect();if(e.clientX>r.right-22&&e.clientY>r.bottom-22){rs=true;
    if(!st||st.x==null){st={...(st||{}),x:r.left,y:r.top};apply()}}});
  addEventListener('pointerup',()=>{if(!rs)return;rs=false;st={...(st||{}),w:panel.offsetWidth,h:panel.offsetHeight};save()});
  addEventListener('resize',()=>{if(!panel.hidden)apply()});
  apply();return apply;
}
function mountDiceLog(){
  $('.dicelog')?.remove();if(!App.chars)return;
  const el=document.createElement('div');el.className='dicelog';el.innerHTML=`<button class="dl-btn" title="Журнал бросков">🎲<span class="dl-n" hidden></span></button><div class="dl-panel" hidden><div class="dl-h"><b>Журнал бросков</b><button class="btn ghost sm" data-x>✕</button></div><div class="dl-list"></div></div>`;
  document.body.appendChild(el);const S=App.chars;let unseen=0;
  const list=el.querySelector('.dl-list'),panel=el.querySelector('.dl-panel'),n=el.querySelector('.dl-n');
  const draw=()=>{list.innerHTML=S.rolls.length?S.rolls.slice().reverse().map(r=>rollCard(r,true)).join(''):'<div class="muted" style="padding:16px;font-size:13px">Бросков пока не было. Бросайте кубы из листа персонажа или с карты.</div>'};
  const fp=floatPanel(panel,el.querySelector('.dl-h'),'dice');
  el.querySelector('.dl-btn').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){unseen=0;n.hidden=true;draw();fp()}};
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
/* категории персонажей: список хранится служебной записью проекта, у персонажа — data.group */
const CG_KEY='__char_groups__';
const CharGroups={
  async load(pid){const {data,error}=await sb.from('map_templates').select('id,items').eq('project_id',pid).eq('name',CG_KEY);if(error){console.warn(error);return this.list=[]}this.row=(data||[])[0]||null;this.pid=pid;return this.list=(this.row?.items||[]).filter(x=>x&&x.name)},
  async save(pid,list){this.list=list;
    if(this.row?.id){const {error}=await sb.from('map_templates').update({items:list}).eq('id',this.row.id);return !fail(error)}
    const {data,error}=await sb.from('map_templates').insert({project_id:pid,name:CG_KEY,icon:'📁',items:list,created_by:App.user.id}).select('id,items').single();if(fail(error))return false;this.row=data;return true},
  list:[],
};
async function renderCharsTab(main,pid,isM){
  const S=App.chars;
  main.innerHTML=`<div class="chars"><aside class="clist"><div class="clist-h"><b>Персонажи</b><span style="display:flex;gap:6px">${isM?'<button class="btn sm" data-grp title="Новая категория">📁</button>':''}<button class="btn sm" data-io title="Импорт, экспорт и шаблон персонажа">⇅</button><button class="btn primary sm" data-new>+ Создать</button></span></div><div class="cl"></div></aside><section class="csheet"></section></div>`;
  const cl=$('.cl',main),cs=$('.csheet',main);let cur=LS.get('rpa_char_'+pid);let mem=isM?await API.members(pid).catch(()=>[]):[];
  const COLL='rpa_cgc_'+pid;let coll=new Set((LS.get(COLL)||'').split('|').filter(Boolean));
  const item=c=>{const d=c.data,cn=VTM.CLANS[d.clan];return `<div class="cli ${c.id===cur?'on':''}" data-id="${c.id}" ${isM?'draggable="true"':''}>${charAvatar(c,'cli-av')}<div class="cli-b"><b>${esc(charName(c))}${isM&&charHidden(c)?' <span class="hid-tag" title="Игроки видят: '+esc(charPubName(c))+'">🙈</span>':''}</b><span>${esc(cn?.n||'Без клана')}${d.predator?' · '+esc(VTM.PREDATORS[d.predator]?.n||''):''}</span><span class="cli-o">${esc(ownerName(c,mem))}</span></div><div class="cli-h" title="Голод">${'●'.repeat(+d.hunger||0)}</div></div>`};
  const drawList=()=>{
    const L=S.list;if(cur&&!S.get(cur))cur=null;if(!cur&&L.length)cur=(S.mine()[0]||L[0]).id;
    if(!L.length&&!CharGroups.list.length){cl.innerHTML=`<div class="muted" style="padding:14px;font-size:13px">${isM?'Создайте персонажей для игроков или NPC.':'У вас пока нет персонажа. Создайте его — мастер сразу увидит лист.'}</div>`;return}
    const PL='__players__',isPl=c=>!!c.owner_id&&!c.npc;
    const names=[...CharGroups.list.map(g=>g.name)];for(const c of L){const g=(c.data.group||'').trim();if(g&&!isPl(c)&&!names.includes(g))names.push(g)}
    const sec=(name,arr,real)=>{const k=name||'∅',cc=coll.has(k);return `<div class="cg ${cc?'coll':''} ${name===PL?'cg-pl':''}" data-g="${esc(name)}"><div class="cg-h" data-gh="${esc(name)}"><span class="cg-ar">${cc?'▸':'▾'}</span><b>${name===PL?'🎭 Персонажи игроков':esc(name||'Без категории')}</b><span class="cg-n">${arr.length}</span>${isM&&real?`<span class="cg-act"><button data-gren="${esc(name)}" title="Переименовать">✎</button><button data-gdel="${esc(name)}" title="Удалить категорию (персонажи останутся)">✕</button></span>`:''}</div>${cc?'':`<div class="cg-b">${arr.map(item).join('')||'<div class="cg-e">Перетащите сюда персонажей</div>'}</div>`}</div>`};
    const pl=L.filter(isPl),rest=L.filter(c=>!isPl(c));
    if(!isM){cl.innerHTML=L.map(item).join('');return}
    if(!names.length&&!pl.length){cl.innerHTML=L.map(item).join('');return}
    cl.innerHTML=(pl.length?sec(PL,pl,false):'')+names.map(n=>sec(n,rest.filter(c=>(c.data.group||'').trim()===n),true)).join('')+(rest.some(c=>!names.includes((c.data.group||'').trim()))||!pl.length?sec('',rest.filter(c=>!names.includes((c.data.group||'').trim())),false):'');
  };
  const drawSheet=()=>{const c=cur&&S.get(cur);if(!c){cs.innerHTML=`<div class="soon"><div class="panel"><div class="ic">🧛</div><h2>Персонажи</h2><p class="muted">${isM?'Создайте персонажа и назначьте его игроку — или дайте игрокам создать своих. Лист один на двоих: правки игрока сразу видит мастер, а мастер может поправить что угодно.':'Создайте персонажа по правилам Vampire: The Masquerade V5. Мастер увидит лист и сможет его поправить.'}</p><button class="btn primary" data-new>+ Создать персонажа</button></div></div>`;cs.querySelector('[data-new]').onclick=()=>openCharWizard(pid,isM,mem);return}
    renderSheet(cs,c,isM,mem)};
  const moveTo=(id,g)=>{const c=S.get(id);if(!c)return;if(g==='__players__'||(c.owner_id&&!c.npc)){toast('Персонажи игроков всегда в своей категории — чтобы перенести, снимите назначение игроку');return}if((c.data.group||'')===g)return;S.patch(id,{group:g})};
  cl.onclick=async e=>{
    const ren=e.target.closest('[data-gren]');if(ren){e.stopPropagation();const o=ren.dataset.gren,n=(prompt('Новое название категории',o)||'').trim();if(!n||n===o)return;
      await CharGroups.save(pid,CharGroups.list.map(g=>g.name===o?{...g,name:n}:g));if(coll.has(o)){coll.delete(o);coll.add(n);LS.set(COLL,[...coll].join('|'))}
      for(const c of S.list)if((c.data.group||'').trim()===o)await S.patch(c.id,{group:n});drawList();return}
    const del=e.target.closest('[data-gdel]');if(del){e.stopPropagation();const o=del.dataset.gdel;if(!await confirmBox(`Удалить категорию «${o}»? Персонажи из неё переедут в «Без категории».`,'Удалить'))return;
      await CharGroups.save(pid,CharGroups.list.filter(g=>g.name!==o));for(const c of S.list)if((c.data.group||'').trim()===o)await S.patch(c.id,{group:''});drawList();return}
    const gh=e.target.closest('[data-gh]');if(gh){const k=gh.dataset.gh||'∅';coll.has(k)?coll.delete(k):coll.add(k);LS.set(COLL,[...coll].join('|'));drawList();return}
    const it=e.target.closest('.cli');if(!it)return;cur=it.dataset.id;LS.set('rpa_char_'+pid,cur);drawList();drawSheet()};
  if(isM){
    main.querySelector('[data-grp]').onclick=async()=>{const n=(prompt('Название категории (например: NPC города, Шабаш, Союзники)')||'').trim();if(!n)return;
      if(CharGroups.list.some(g=>g.name===n))return toast('Такая категория уже есть');await CharGroups.save(pid,[...CharGroups.list,{name:n}]);
      if(cur&&S.get(cur)&&!S.get(cur).data.group&&await confirmBox(`Переместить «${S.get(cur).name}» в «${n}»?`,'Переместить'))moveTo(cur,n);drawList()};
    cl.addEventListener('dragstart',e=>{const it=e.target.closest('.cli');if(!it)return;e.dataTransfer.setData('text/rpa-char',it.dataset.id);e.dataTransfer.effectAllowed='move';it.classList.add('drag')});
    cl.addEventListener('dragend',e=>{cl.querySelectorAll('.drag,.dov').forEach(x=>x.classList.remove('drag','dov'))});
    cl.addEventListener('dragover',e=>{const g=e.target.closest('.cg');if(!g||!e.dataTransfer.types.includes('text/rpa-char'))return;e.preventDefault();cl.querySelectorAll('.dov').forEach(x=>x!==g&&x.classList.remove('dov'));g.classList.add('dov')});
    cl.addEventListener('drop',e=>{const g=e.target.closest('.cg');const id=e.dataTransfer.getData('text/rpa-char');if(!g||!id)return;e.preventDefault();g.classList.remove('dov');moveTo(id,g.dataset.g||'')});
  }
  main.querySelector('[data-io]').onclick=e=>charIOMenu(e.currentTarget,pid,isM,cur,c=>{if(c){cur=c.id;LS.set('rpa_char_'+pid,cur)}drawList();drawSheet()});
  main.querySelector('[data-new]').onclick=()=>openCharWizard(pid,isM,mem,c=>{cur=c.id;LS.set('rpa_char_'+pid,cur);drawList();drawSheet()});
  let pend=false;
  const off=S.on(id=>{drawList();if(!id||id===cur){const a=document.activeElement;if(a&&cs.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){if(!pend){pend=true;a.addEventListener('blur',()=>{pend=false;setTimeout(()=>{if(cs.isConnected){drawList();drawSheet()}},50)},{once:true})}}else drawSheet()}});
  App.unsub=()=>off();
  await S.ready;await CharGroups.load(pid);drawList();drawSheet();
}

const genOpts=(isM,thin)=>VTM.GENERATIONS.filter(([g])=>isM?true:(thin?g>=14:g>=10&&g<=13)).map(([g,n])=>[g,n]);
const srcTag=s=>s?`<span class="src" title="${esc(VTM.srcText(s))}">${esc(s.split(';')[0].replace(/^([A-Z]+).*/,'$1'))}</span>`:'';
function renderSheet(host,c,isM,mem){
  const S=App.chars,d=c.data,ed=S.canEdit(c),clan=VTM.CLANS[d.clan],bp=VTM.bpRow(d),cap=VTM.cap(d);
  const sel=(k,opts,v,dis)=>`<select data-f="${k}" ${ed&&!dis?'':'disabled'}>${opts.map(([a,b])=>`<option value="${a}" ${String(a)===String(v)?'selected':''}>${esc(b)}</option>`).join('')}</select>`;
  const inp=(k,v,ph='')=>`<input data-f="${k}" value="${esc(v||'')}" placeholder="${esc(ph)}" ${ed?'':'readonly'}>`;
  const known=(d.powers||[]).map(id=>VTM.POWER[id]).filter(Boolean);
  const rites=(d.rites||[]).map(id=>VTM.RITE[id]).filter(Boolean);
  const discKeys=[...new Set([...(clan?.d||[]),...Object.keys(d.disc||{}).filter(k=>d.disc[k]>0)])];
  const chk=VTM.check(d),bad=chk.filter(x=>!x[0]).length;const gb=VTM.GEN_BP[+d.gen]||[0,10];
  const extra=VTM.extraPowers(d),totDots=Object.values(d.disc||{}).reduce((s,v)=>s+ +v,0);
  host.innerHTML=`<div class="sheet ${ed?'':'ro'}">
    <div class="sh-top">
      <button class="sh-av" data-look title="${ed?'Портрет и значок на карте':'Портрет'}">${charAvatar(c,'sh-avi')}</button><div class="sh-name"><input class="nm" data-f="name" value="${esc(isM||c.owner_id===App.user.id?(d.name||c.name):charName(c))}" placeholder="Имя персонажа" ${ed?'':'readonly'}><div class="sh-sub">${esc(clan?.n||'Клан не выбран')} · ${esc(String(d.gen||''))}-е поколение${VTM.AGES[d.age]?' · '+esc(VTM.AGES[d.age].n):''} · ${esc(ownerName(c,mem))}</div>${isM?`<div class="sh-alias"><label>Категория<select data-f="group"><option value="">— без категории —</option>${[...new Set([...CharGroups.list.map(g=>g.name),...(d.group?[d.group]:[])])].map(g=>`<option ${g===d.group?'selected':''}>${esc(g)}</option>`).join('')}</select></label><label>Для игроков<input data-f="alias" value="${esc(d.alias||'')}" placeholder="как видят до знакомства, например: Незнакомец в плаще"></label>${d.alias&&String(d.alias).trim()?`<button class="btn sm ${d.revealed?'':'primary'}" data-reveal>${d.revealed?'🙈 Скрыть имя':'👁 Открыть имя игрокам'}</button><span class="sh-alst">${d.revealed?'игроки видят настоящее имя':'игроки видят «'+esc(String(d.alias).trim())+'»'}</span>`:''}</div>`:''}</div>
      <div class="sh-act"><button class="btn primary" data-roll>🎲 Бросок</button><button class="btn" data-rouse title="Бросок на голод: d10, на 1–5 Голод растёт">🩸 Бросок на голод</button>${isM?`<select data-owner title="Чей персонаж"><option value="">Не назначен</option><option value="npc" ${c.npc?'selected':''}>Персонаж мастера (NPC)</option>${(mem||[]).filter(m=>m.role!=='comaster').map(m=>`<option value="${m.user_id}" ${c.owner_id===m.user_id?'selected':''}>Игрок: ${esc(m.profile?.name||'—')}</option>`).join('')}</select>`:''}${isM||c.created_by===App.user.id?'<button class="btn ghost" data-del title="Удалить персонажа">🗑</button>':''}</div>
    </div>
    <div class="sh-grid info">
      <label>Концепция${inp('concept',d.concept,'Кем был при жизни')}</label>
      <label>Клан${sel('clan',[['','—'],...Object.entries(VTM.CLANS).map(([k,v])=>[k,v.n])],d.clan)}</label>
      <label>Стиль охоты${sel('predator',[['','—'],...Object.entries(VTM.PREDATORS).map(([k,v])=>[k,`${v.n} (${v.en})`])],d.predator)}</label>
      <label>Поколение${sel('gen',genOpts(isM,clan?.thin).concat(genOpts(isM,clan?.thin).some(([g])=>g===+d.gen)?[]:[[+d.gen,d.gen+'-е']]),d.gen,!isM)}</label>
      <label>Сир${inp('sire',d.sire)}</label><label>Хроника${inp('chronicle',d.chronicle)}</label>
      <label>Цель${inp('ambition',d.ambition,'Долгосрочная цель (Ambition)')}</label><label>Прихоть${inp('desire',d.desire,'Желание на эту сессию (Desire)')}</label>
    </div>
    <div class="sh-tracks">
      <div class="shtr"><span>Здоровье <small>${VTM.healthMax(d)}</small></span>${boxes('health',c)}</div>
      <div class="shtr"><span>Воля <small>${VTM.wpMax(d)}</small></span>${boxes('wp',c)}</div>
      <div class="shtr"><span>Человечность <small>${d.humanity}${d.stains?` · пятна ${d.stains}`:''}</small></span>${boxes('humanity',c)}${ed?`<span class="stn"><button data-stain="-1" title="Убрать пятно">−</button>пятна<button data-stain="1" title="Добавить пятно">+</button></span>`:''}</div>
      <div class="shtr"><span>Голод</span>${boxes('hunger',c)}</div>
      <div class="shtr wide"><span>Сила крови <small>${gb[0]}–${gb[1]} для ${d.gen}-го поколения · прилив +${bp[0]} · лечение ${bp[1]} · бонус к дисциплинам ${bp[2]} · переброс броска на голод до ур. ${bp[3]||'—'} · тяжесть изъяна ${bp[4]}</small></span>${dots('bp',+d.bp||0,Math.max(gb[1],+d.bp||0),!(ed&&isM))}<small class="feed">${esc(VTM.BP_FEED[+d.bp||0]||'')}</small></div>
    </div>
    <div class="sh-hint">Клетки здоровья и Воли: клик — лёгкий урон (/), ещё клик — тяжёлый (✕). Клик по названию черты — бросок с ней.${isM?` Предел точек: <select data-cap>${[5,6,7,8,9,10].map(v=>`<option value="${v}" ${cap===v?'selected':''}>${v===5?'5 (официально)':v+' (домашнее правило)'}</option>`).join('')}</select>`:''}</div>
    <h3 class="sh-h">Атрибуты</h3>
    <div class="sh-cols">${VTM.ATTRS.map(([g,gn,list])=>`<div><h4>${gn}</h4>${list.map(([k,n])=>`<div class="trait"><button class="tn" data-rt="${k}">${n}</button>${dots('attr.'+k,VTM.val(d,k),cap,!ed)}</div>`).join('')}</div>`).join('')}</div>
    <h3 class="sh-h">Навыки</h3>
    <div class="sh-cols">${VTM.SKILLS.map(([g,gn,list])=>`<div><h4>${gn}</h4>${list.map(([k,n])=>`<div class="trait sk"><button class="tn" data-rt="${k}">${n}</button>${dots('skills.'+k,VTM.val(d,k),cap,!ed)}${d.spec?.[k]!==undefined&&d.spec?.[k]!==null?`<input class="spec" data-spec="${k}" value="${esc(d.spec[k])}" placeholder="специализация" ${ed?'':'readonly'}>`:ed&&VTM.val(d,k)?`<button class="addspec" data-addspec="${k}" title="Добавить специализацию">+ спец.</button>`:''}</div>`).join('')}</div>`).join('')}</div>
    <h3 class="sh-h">Дисциплины <small class="hsub">сил: ${known.length} из ${totDots+extra}${extra?` (+${extra} за Силу крови выше 5, Gehenna War)`:''}</small></h3>
    <div class="discs">${discKeys.length?discKeys.map(k=>{const v=VTM.val(d,k),pw=known.filter(p=>p.disc===k),rt=rites.filter(r=>(k==='bloodsorcery'&&r.id.startsWith('rit'))||(k==='oblivion'&&r.id.startsWith('cer')));
      return `<div class="disc"><div class="disc-h"><span class="di">${VTM.DISC_ICON[k]}</span><b>${VTM.DISC[k]}</b><small class="en">${VTM.DISC_EN[k]}</small>${clan?.d?.includes(k)?'<span class="tag">клановая</span>':''}${dots('disc.'+k,v,VTM.discCap(d),!ed)}</div>
      <div class="pw">${pw.map(p=>`<button class="pwb" data-pw="${p.id}" title="${esc(p.en)} — ${esc((typeof I18N!=='undefined'&&I18N.lang==='en')?p.d:(VTM.POW_FULL?.[p.id]?.t||p.d))}${p.vs?' · против: '+esc(p.vs):''} · ${esc(VTM.srcText(p.src))}"><span class="lv">${p.l}</span>${esc(p.n)}${p.r?`<span class="rc">${'🩸'.repeat(p.r)}</span>`:''}${ed?`<i data-unpw="${p.id}" title="Убрать силу">✕</i>`:''}</button>`).join('')}${ed&&v>0?`<button class="pwb add" data-addpw="${k}">+ сила</button>`:''}</div>
      ${(k==='bloodsorcery'||k==='oblivion')&&v>0?`<div class="rites"><span class="rl">${k==='bloodsorcery'?'Ритуалы':'Церемонии'}</span>${rt.map(r=>`<button class="pwb rite" data-rite="${r.id}" title="${esc(r.en)} · ${esc(VTM.srcText(r.src))}"><span class="lv">${r.l}</span>${esc(r.n)}${ed?`<i data-unrite="${r.id}" title="Убрать">✕</i>`:''}</button>`).join('')}${ed?`<button class="pwb add" data-addrite="${k}">+ ${k==='bloodsorcery'?'ритуал':'церемония'}</button>`:''}</div>`:''}</div>`}).join(''):'<div class="muted">Выберите клан, чтобы увидеть клановые дисциплины.</div>'}
      ${ed?`<div class="disc-add">${sel('_adddisc',[['','+ Добавить дисциплину…'],...Object.entries(VTM.DISC).filter(([k])=>!discKeys.includes(k)).map(([k,n])=>[k,n])],'')}</div>`:''}</div>
    ${clan?`<div class="bane"><b>Клановый изъян (тяжесть ${VTM.baneSeverity(d)}):</b> ${esc(clan.bane)}<br><b>Побуждение:</b> ${esc(clan.comp)} <span class="srcl">${esc(VTM.srcText(clan.src))}</span></div>`:''}
    <div class="sh-two">
      <div><h3 class="sh-h">Достоинства и недостатки</h3><div class="advs">${(d.adv||[]).map((a,i)=>{const m=VTM.MERIT[a.n];const allowed=m?m.dots:[1,2,3,4,5];return `<div class="adv ${a.flaw?'flaw':''}"><input data-adv="${i}" data-k="n" value="${esc(a.n)}" ${ed&&!m?'':'readonly'} title="${m?esc(m.en+' · '+VTM.srcText(m.src)):''}">${a.note!==undefined||m?.rep?`<input class="advnote" data-adv="${i}" data-k="note" value="${esc(a.note||'')}" placeholder="уточнение" ${ed?'':'readonly'}>`:''}<span class="seg">${allowed.map(v=>`<button data-advd="${i}" data-v="${v}" class="${+a.dots===v?'on':''}" ${ed&&allowed.length>1?'':'disabled'}>${v}</button>`).join('')}</span>${ed?`<button class="x" data-advdel="${i}" title="Удалить">✕</button>`:''}</div>`}).join('')}${ed?'<button class="btn sm" data-advadd>+ Достоинство или недостаток</button>':''}</div></div>
      <div><h3 class="sh-h">Принципы и опоры</h3><div class="convs">${(d.conv||[]).map((v,i)=>`<div class="conv"><input data-conv="${i}" data-k="c" value="${esc(v.c||'')}" placeholder="Принцип (Conviction)" ${ed?'':'readonly'}><input data-conv="${i}" data-k="t" value="${esc(v.t||'')}" placeholder="Опора — человек, связанный с ним" ${ed?'':'readonly'}>${ed?`<button class="x" data-convdel="${i}">✕</button>`:''}</div>`).join('')}${ed&&(d.conv||[]).length<3?'<button class="btn sm" data-convadd>+ Принцип</button>':''}</div></div>
    </div>
    <div class="sh-two"><div><h3 class="sh-h">Внешность и заметки</h3><textarea data-f="notes" rows="5" ${ed?'':'readonly'} placeholder="Внешность, история, связи…">${esc(d.notes||'')}</textarea></div>
      <div><h3 class="sh-h">Опыт</h3><div class="xp"><label>Всего<input type="number" data-f="xp.total" value="${+d.xp?.total||0}" ${ed?'':'readonly'}></label><label>Потрачено<input type="number" data-f="xp.spent" value="${+d.xp?.spent||0}" ${ed?'':'readonly'}></label><span>Остаток <b>${(+d.xp?.total||0)-(+d.xp?.spent||0)}</b></span></div>
      <details class="chk"><summary>Проверка по правилам создания V5 ${bad?`<span class="bad">${bad} ${plural(bad,'замечание','замечания','замечаний')}</span>`:'<span class="ok">всё по правилам</span>'}</summary>${chk.map(([ok,t,s])=>`<div class="${ok?'ok':'bad'}">${ok?'✓':'•'} ${esc(t)} <small>${esc(s)}</small></div>`).join('')}</details></div></div>
  </div>`;
  const P=sets=>S.patch(c.id,sets);
  let tm={};const deb=(k,f)=>{clearTimeout(tm[k]);tm[k]=setTimeout(f,450)};
  host.oninput=e=>{if(!ed)return;const t=e.target;
    if(t.dataset.f&&t.tagName!=='SELECT'){const v=t.type==='number'?+t.value||0:t.value;deb(t.dataset.f,()=>P({[t.dataset.f]:v}))}
    if(t.dataset.spec)deb('spec'+t.dataset.spec,()=>P({['spec.'+t.dataset.spec]:t.value.trim()||null}));
    if(t.dataset.adv!==undefined)deb('adv',()=>{const adv=clone(S.get(c.id).data.adv||[]);adv[+t.dataset.adv][t.dataset.k]=t.value;P({adv})});
    if(t.dataset.conv!==undefined)deb('conv',()=>{const conv=clone(S.get(c.id).data.conv||[]);conv[+t.dataset.conv][t.dataset.k]=t.value;P({conv})});
  };
  host.onchange=e=>{const t=e.target;
    if(t.dataset.owner!==undefined){const v=t.value;S.setOwner(c.id,v==='npc'||!v?null:v,v==='npc');return}
    if(t.dataset.cap!==undefined&&isM){P({cap:+t.value});return}
    if(!ed)return;
    if(t.dataset.f==='_adddisc'&&t.value){P({['disc.'+t.value]:1});return}
    if(t.tagName==='SELECT'&&t.dataset.f){const k=t.dataset.f;let v=t.value;if(k==='gen'){v=+v;const g=VTM.GEN_BP[v];const b=Math.max(g[0],Math.min(g[1],+d.bp||0));P({gen:v,bp:b})}else P({[k]:v})}
  };
  host.onclick=async e=>{const t=e.target;const cc=S.get(c.id)||c;
    if(t.closest('[data-reveal]')&&isM){P({revealed:!cc.data.revealed});return}
    if(t.closest('[data-look]')){if(ed)openLookModal(cc);else if(cc.data.portrait)window.open(cc.data.portrait,'_blank');return}
    const dt=t.closest('[data-d]');if(dt&&ed){const w=dt.parentElement,path=w.dataset.dots,cur=+w.dataset.v,n=+dt.dataset.d;let v=n===cur?n-1:n;
      if(w.classList.contains('ro'))return;
      if(path==='bp'){if(!isM)return;const g=VTM.GEN_BP[+cc.data.gen]||[0,10];v=Math.max(g[0],Math.min(g[1],v));return P({bp:v})}
      if(path.startsWith('attr.'))v=Math.max(1,v);
      if(path.startsWith('disc.')&&v===0)return P({[path]:null,powers:(cc.data.powers||[]).filter(id=>VTM.POWER[id]?.disc!==path.split('.')[1])});
      return P({[path]:v||(path.startsWith('skills.')?null:v)})}
    const ad=t.closest('[data-advd]');if(ad&&ed&&!ad.disabled){const adv=clone(cc.data.adv||[]);adv[+ad.dataset.advd].dots=+ad.dataset.v;return P({adv})}
    const bx=t.closest('[data-box] i');if(bx&&ed){return P(cycleBox(cc,bx.parentElement.dataset.box,+bx.dataset.i))}
    if(t.closest('[data-stain]')&&ed){const st=Math.max(0,Math.min(10,(+cc.data.stains||0)+ +t.closest('[data-stain]').dataset.stain));return P({stains:st})}
    const rt=t.closest('[data-rt]');if(rt){const k=rt.dataset.rt;if(k in VTM.ATTR_NAME)openRollDialog(cc,{a:k,b:'',label:VTM.ATTR_NAME[k]});else openRollDialog(cc,{a:DEF_ATTR[k]||'wit',b:k,label:VTM.SKILL_NAME[k]});return}
    if(t.closest('[data-roll]'))return openRollDialog(cc,{a:'dex',b:'athletics'});
    if(t.closest('[data-rouse]'))return rouseCheck(cc);
    const as=t.closest('[data-addspec]');if(as){const k=as.dataset.addspec;as.outerHTML=`<input class="spec" data-spec="${k}" placeholder="специализация, например: Ножи">`;host.querySelector(`[data-spec="${k}"]`).focus();return}
    if(t.closest('[data-unpw]')){e.stopPropagation();const id=t.closest('[data-unpw]').dataset.unpw;return P({powers:(cc.data.powers||[]).filter(x=>x!==id)})}
    if(t.closest('[data-unrite]')){e.stopPropagation();const id=t.closest('[data-unrite]').dataset.unrite;return P({rites:(cc.data.rites||[]).filter(x=>x!==id)})}
    if(t.closest('[data-pw]'))return usePower(cc,t.closest('[data-pw]').dataset.pw);
    if(t.closest('[data-rite]'))return useRite(cc,t.closest('[data-rite]').dataset.rite);
    if(t.closest('[data-addpw]'))return pickPower(cc,t.closest('[data-addpw]').dataset.addpw,null,isM);
    if(t.closest('[data-addrite]'))return pickRite(cc,t.closest('[data-addrite]').dataset.addrite);
    if(t.closest('[data-advadd]'))return pickMerit(cc.data.adv||[],m=>{const adv=[...(S.get(c.id).data.adv||[]),m];P({adv})});
    if(t.closest('[data-advdel]')){const adv=clone(cc.data.adv||[]);adv.splice(+t.closest('[data-advdel]').dataset.advdel,1);return P({adv})}
    if(t.closest('[data-convadd]'))return P({conv:[...(cc.data.conv||[]),{c:'',t:''}]});
    if(t.closest('[data-convdel]')){const conv=clone(cc.data.conv||[]);conv.splice(+t.closest('[data-convdel]').dataset.convdel,1);return P({conv})}
    if(t.closest('[data-del]')){if(await confirmBox(`Удалить персонажа «${c.name}»?`))S.remove(c.id)}
  };
}

/* выбор силы: уровень не выше рейтинга (и не выше 5), амальгамы — при нужной второй дисциплине */
/* подробная карточка силы: как работает */
function powerCard(p,d,isM){
  const F=VTM.POW_FULL?.[p.id],en=typeof I18N!=='undefined'&&I18N.lang==='en';
  const amOk=!d||VTM.amalgamOk(d,p),lv=d?Math.min(5,VTM.val(d,p.disc)):5;
  const chip=(k,v,cls='')=>v?`<div class="pc-r ${cls}"><span>${k}</span><b>${v}</b></div>`:'';
  const txt=en?(p.d||''):(F?.t||p.d||'');
  return `<div class="pc"><div class="pc-h"><span class="pc-lv">${p.l}</span><div><b>${esc(p.n)}</b><small>${esc(p.en)} · ${VTM.DISC_ICON[p.disc]} ${esc(VTM.DISC[p.disc])}${p.branch?' · '+esc(p.branch):''}</small></div></div>
    <div class="pc-g">${chip('Цена',esc(p.cost==='бесплатно'?'бесплатно':p.cost+(p.r?` (${p.r} ${p.r===1?'бросок':'броска'} на голод)`:'')))}${chip('Длительность',F?.d&&!en?esc(F.d):'')}
      ${chip('Пул',p.pool?p.pool.map(([a,b])=>esc(VTM.traitName(a))+' + '+esc(VTM.traitName(b))).join(' / '):'без броска')}${chip('Против',p.vs?esc(p.vs):'')}
      ${p.am?chip('Амальгама',esc(VTM.amText(p))+(amOk?' ✓':' — нет'),amOk?'':'bad'):''}${d&&p.l>lv?chip('Доступно','нужен уровень '+p.l,'bad'):''}</div>
    ${txt?`<p class="pc-t">${esc(txt)}</p>`:''}<div class="pc-s">${esc(VTM.srcText(p.src))}</div></div>`;
}
function pickPower(c,disc,onPick,isM){
  const d=c.data,v=VTM.val(d,disc),have=new Set(d.powers||[]),maxL=Math.min(5,v);
  const branches=disc==='oblivion';
  const row=p=>{const amOk=VTM.amalgamOk(d,p),lvOk=p.l<=maxL;return `<button class="pwi ${have.has(p.id)?'on':''} ${lvOk&&(amOk||isM)?'':'dis'}" data-p="${p.id}" ${lvOk&&(amOk||isM)?'':'aria-disabled="true"'}><span class="lv">${p.l}</span><div><b>${esc(p.n)}</b> <span class="en">${esc(p.en)}</span>${p.am?` <span class="tag ${amOk?'':'warn'}">амальгама: ${esc(VTM.amText(p))}</span>`:''}${p.branch?` <span class="tag">${esc(p.branch)}</span>`:''}
    <small>${p.d?esc(p.d)+' · ':''}${p.pool?`пул: ${p.pool.map(([a,b])=>VTM.traitName(a)+' + '+VTM.traitName(b)).join(' / ')}`:'без броска'}${p.vs?` против ${esc(p.vs)}`:''} · ${esc(p.cost)}</small><small class="srcl">${esc(VTM.srcText(p.src))}</small></div></button>`};
  const {el,close}=openModal(`<h3>${VTM.DISC_ICON[disc]} ${VTM.DISC[disc]} — выбор силы</h3><p class="muted" style="margin-top:-6px;font-size:13px">Доступны силы уровня не выше ${maxL}. На каждую точку дисциплины — одна сила${VTM.extraPowers(d)?`, плюс ${VTM.extraPowers(d)} доп. за Силу крови выше 5 (Gehenna War)`:''}. Амальгамы требуют вторую дисциплину${isM?' (мастер может выдать без неё)':''}.</p>
    <input class="pwsearch" placeholder="Поиск по названию (рус./англ.)" data-q><div class="pwwrap"><div class="pwlist"></div><aside class="pwdet"><div class="pwdet-e">Наведите на силу, чтобы увидеть, как она работает</div></aside></div><div class="modal-actions"><button class="btn" data-close>Готово</button></div>`);
  el.classList.add('wide');
  const list=el.querySelector('.pwlist'),det=el.querySelector('.pwdet');
  let shown=null;const show=id=>{if(id===shown)return;shown=id;const p=VTM.POWER[id];if(p)det.innerHTML=powerCard(p,d,isM)};
  list.addEventListener('mouseover',e=>{const b=e.target.closest('[data-p]');if(b)show(b.dataset.p)});
  list.addEventListener('focusin',e=>{const b=e.target.closest('[data-p]');if(b)show(b.dataset.p)});
  const draw=q=>{q=(q||'').toLowerCase();const ps=VTM.POWERS[disc].filter(p=>!q||p.n.toLowerCase().includes(q)||p.en.toLowerCase().includes(q));
    list.innerHTML=[1,2,3,4,5].map(l=>{const ls=ps.filter(p=>p.l===l);return ls.length?`<div class="pwlv">Уровень ${l}</div>${ls.map(row).join('')}`:''}).join('')};
  draw();el.querySelector('[data-q]').oninput=e=>draw(e.target.value);
  list.onclick=e=>{const b=e.target.closest('[data-p]');if(!b)return;show(b.dataset.p);if(b.classList.contains('dis'))return;const id=b.dataset.p;
    if(onPick){onPick(id,b);return}
    const cur=App.chars.get(c.id).data.powers||[];const has=cur.includes(id);
    App.chars.patch(c.id,{powers:has?cur.filter(x=>x!==id):[...cur,id]});b.classList.toggle('on',!has)};
  return {el,close};
}
function pickRite(c,disc){
  const d=c.data,v=Math.min(5,VTM.val(d,disc)),have=new Set(d.rites||[]),all=disc==='bloodsorcery'?VTM.RITUALS:VTM.CEREMONIES;
  const {el,close}=openModal(`<h3>${VTM.DISC_ICON[disc]} ${disc==='bloodsorcery'?'Ритуалы Кровавого чародейства':'Церемонии Обливиона'}</h3><p class="muted" style="margin-top:-6px;font-size:13px">Уровень не выше ${v}. Первый ритуал 1-го уровня даётся бесплатно с первой точкой, остальные покупаются за опыт (уровень × 3).</p>
    <input class="pwsearch" placeholder="Поиск по названию (рус./англ.)" data-q><div class="pwlist"></div><div class="modal-actions"><button class="btn" data-close>Готово</button></div>`);
  el.classList.add('wide');const list=el.querySelector('.pwlist');
  const draw=q=>{q=(q||'').toLowerCase();const rs=all.filter(r=>!q||r.n.toLowerCase().includes(q)||r.en.toLowerCase().includes(q));
    list.innerHTML=[1,2,3,4,5].map(l=>{const ls=rs.filter(r=>r.l===l);return ls.length?`<div class="pwlv">Уровень ${l}</div>${ls.map(r=>`<button class="pwi ${have.has(r.id)?'on':''}" data-r="${r.id}" ${r.l>v?'disabled':''}><span class="lv">${r.l}</span><div><b>${esc(r.n)}</b> <span class="en">${esc(r.en)}</span><small>пул: ${VTM.traitName(r.pool[0][0])} + ${VTM.traitName(r.pool[0][1])}</small><small class="srcl">${esc(VTM.srcText(r.src)||'источник уточняется')}</small></div></button>`).join('')}`:''}).join('')};
  draw();el.querySelector('[data-q]').oninput=e=>draw(e.target.value);
  list.onclick=e=>{const b=e.target.closest('[data-r]');if(!b||b.disabled)return;const id=b.dataset.r;const cur=App.chars.get(c.id).data.rites||[];const has=cur.includes(id);if(has)have.delete(id);else have.add(id);App.chars.patch(c.id,{rites:has?cur.filter(x=>x!==id):[...cur,id]});b.classList.toggle('on',!has)};
}
async function useRite(c,id){
  const r=VTM.RITE[id];if(!r)return;const ok=await rouseCheck(c,{times:1,level:r.l,why:`${r.n} (${r.id.startsWith('rit')?'ритуал':'церемония'} ${r.l})`});if(!ok)return;
  const [a,b]=r.pool[0];openRollDialog(App.chars.get(c.id)||c,{a,b,label:r.n,desc:`${r.en} · ${VTM.srcText(r.src)}`})
}
/* выбор достоинства/недостатка из каталога; неповторяемые нельзя взять дважды */
function pickMerit(cur,onAdd,{wizard}={}){
  const taken=new Set((cur||[]).map(a=>a.n));
  const {el,close}=openModal(`<h3>Достоинства, недостатки и факты биографии</h3><div class="mtabs"><button class="on" data-t="0">Достоинства</button><button data-t="1">Недостатки</button><button data-t="c">Своё</button></div><input class="pwsearch" placeholder="Поиск (рус./англ.)" data-q><div class="pwlist mlistc"></div><div class="modal-actions"><button class="btn" data-close>Закрыть</button></div>`);
  el.classList.add('wide');const list=el.querySelector('.pwlist');let tab='0',q='';
  const draw=()=>{
    if(tab==='c'){list.innerHTML=`<form class="mcustom"><label class="f">Название<input name="n" required maxlength="60"></label><label class="f">Точки<input name="d" type="number" min="1" max="10" value="1"></label><label class="ck"><input type="checkbox" name="fl"> Это недостаток</label><button class="btn primary">Добавить</button></form>`;
      list.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.target;const n=f.n.value.trim();if(!n)return;if(taken.has(n)){toast('Такое уже есть у персонажа');return}taken.add(n);onAdd({n,dots:Math.max(1,+f.d.value||1),flaw:f.fl.checked,note:''});close()};return}
    const ms=VTM.MERITS.filter(m=>m.flaw===(tab==='1')&&(!q||m.n.toLowerCase().includes(q)||m.en.toLowerCase().includes(q)));
    const cats=[...new Set(ms.map(m=>m.cat))];
    list.innerHTML=cats.map(cat=>`<div class="pwlv">${esc(cat)}</div>${ms.filter(m=>m.cat===cat).map(m=>{const dis=!m.rep&&taken.has(m.n);return `<button class="pwi ${dis?'on':''}" data-m="${esc(m.n)}" ${dis?'disabled':''}><span class="lv dots">${m.dots.length>1?m.dots[0]+'–'+m.dots.at(-1):m.dots[0]}</span><div><b>${esc(m.n)}</b> <span class="en">${esc(m.en)}</span>${m.rep?' <span class="tag">можно несколько</span>':''}${dis?' <span class="tag warn">уже есть</span>':''}<small class="srcl">${esc(VTM.srcText(m.src))}</small></div></button>`}).join('')}`).join('')||'<div class="muted">Ничего не найдено</div>'};
  draw();
  el.querySelector('.mtabs').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;tab=b.dataset.t;el.querySelectorAll('.mtabs button').forEach(x=>x.classList.toggle('on',x===b));draw()};
  el.querySelector('[data-q]').oninput=e=>{q=e.target.value.toLowerCase();draw()};
  list.onclick=e=>{const b=e.target.closest('[data-m]');if(!b||b.disabled)return;const m=VTM.MERIT[b.dataset.m];if(!m.rep)taken.add(m.n);onAdd({n:m.n,dots:m.dots[0],flaw:m.flaw,...(m.rep?{note:''}:{})});if(!m.rep){b.disabled=true;b.classList.add('on')}toast(`Добавлено: ${m.n}`)};
}

/* ---------- мастер создания персонажа по правилам V5 ---------- */
function openCharWizard(pid,isM,mem,onDone){
  const D=VTM.blank();D.age='neonate';let step=0,free=false,owner=isM?'':App.user.id,npc=false,predDisc='',predSpec='';
  const STEPS=['Концепция и клан','Атрибуты','Навыки','Стиль охоты','Дисциплины','Достоинства','Принципы'];
  const {el,close}=openModal(`<div class="wiz"><div class="wz-steps"></div><div class="wz-body"></div><div class="wz-foot"><span class="wz-err"></span><button class="btn" data-back>Назад</button><button class="btn primary" data-next>Далее</button></div></div>`);
  el.classList.add('wide','wizm');
  const body=el.querySelector('.wz-body'),stepsEl=el.querySelector('.wz-steps'),err=el.querySelector('.wz-err');
  bindLookEditor(el,pid,p=>{Object.assign(D,p);draw()});
  const capV=()=>VTM.cap(D);const RNG=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
  const cntA=()=>{const c={};Object.values(D.attr).forEach(v=>c[v]=(c[v]||0)+1);return c};
  const cntS=()=>{const c={};Object.values(D.skills).forEach(v=>{if(v>0)c[v]=(c[v]||0)+1});return c};
  const baseBp=()=>{const g=VTM.GEN_BP[+D.gen]||[1,3];const ag=VTM.AGES[D.age]||{};return ag.gm?Math.max(g[0],Math.min(g[1],D._bp??g[0])):g[0]};
  const applyPred=()=>{
    D.adv=D.adv.filter(a=>!a.pred);const p=VTM.PREDATORS[D.predator];D.humanity=7+(VTM.AGES[D.age]?.hum||0);D.bp=baseBp();
    if(!p)return;D.humanity+=p.hum||0;D.bp=Math.min((VTM.GEN_BP[+D.gen]||[0,10])[1],D.bp+(p.bp||0));p.adv.forEach(([n,dots,flaw])=>D.adv.push({n,dots,flaw,pred:true}));
  };
  const flawOk=()=>{const ag=VTM.AGES[D.age]||{};const a=D.adv.filter(x=>!x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0),f=D.adv.filter(x=>x.flaw&&!x.pred).reduce((s,x)=>s+x.dots,0);return {a,f,na:7+(ag.adv||0),nf:2+(ag.flaw||0)}};
  const valid=()=>{
    if(step===0&&!D.name.trim())return 'Введите имя';
    if(free)return '';
    if(step===0){if(!D.clan)return 'Выберите клан'}
    if(step===1){const a=Object.values(D.attr).sort((x,y)=>y-x);if(JSON.stringify(a)!==JSON.stringify(VTM.ATTR_SPREAD))return 'Распределите атрибуты: 4, 3, 3, 3, 2, 2, 2, 2, 1'}
    if(step===2){const sp=VTM.SKILL_SPREADS[D.spread].d,c=cntS();if(!Object.keys({...sp,...c}).every(k=>(sp[k]||0)===(c[k]||0)))return 'Навыки не соответствуют выбранному распределению';for(const k of VTM.FREE_SPEC_SKILLS)if(D.skills[k]&&!(D.spec[k]||'').trim())return `Укажите специализацию для навыка «${VTM.SKILL_NAME[k]}»`}
    if(step===3){if(!D.predator)return 'Выберите стиль охоты';if(!predDisc&&!VTM.CLANS[D.clan]?.thin)return 'Выберите дисциплину от стиля охоты';if(predSpec==='')return 'Выберите специализацию от стиля охоты'}
    if(step===4){const cl=VTM.CLANS[D.clan];if(!cl.thin){const base=Object.entries(D.disc).map(([k,v])=>v-(k===predDisc?1:0)).filter(v=>v>0).sort((a,b)=>b-a);if(JSON.stringify(base)!=='[2,1]')return 'Нужно: одна дисциплина на 2 и одна на 1 (плюс точка от стиля охоты)';const tot=Object.values(D.disc).reduce((s,v)=>s+v,0)+VTM.extraPowers(D);if(D.powers.length!==tot)return `Выберите силы: ${D.powers.length} из ${tot}`}}
    if(step===5){const {a,f,na,nf}=flawOk();if(a!==na)return `Достоинства: нужно ${na} точек, сейчас ${a}`;if(f!==nf)return `Недостатки: нужно ${nf}, сейчас ${f}`;const dup=VTM.dupMerits(D.adv);if(dup.length)return 'Повторяются: '+dup.join(', ')}
    if(step===6){if(!D.conv.length||D.conv.some(c=>!c.c.trim()))return 'Добавьте от 1 до 3 принципов'}
    return '';
  };
  const ATTR_ROWS=()=>{const c=cntA(),need={4:1,3:3,2:4,1:1};return `<div class="wz-cnt">${[4,3,2,1].map(v=>`<span class="${(c[v]||0)===need[v]?'ok':(c[v]||0)>need[v]?'over':''}">на ${v}: ${c[v]||0}/${need[v]}</span>`).join('')}</div><div class="sh-cols">${VTM.ATTRS.map(([g,gn,l])=>`<div><h4>${gn}</h4>${l.map(([k,n])=>`<div class="trait"><span class="tn">${n}</span><span class="seg">${(free?RNG(1,capV()):[1,2,3,4,5]).map(v=>`<button data-attr="${k}" data-v="${v}" class="${D.attr[k]===v?'on':''}">${v}</button>`).join('')}</span></div>`).join('')}</div>`).join('')}</div>`};
  const ageList=()=>Object.entries(VTM.AGES).filter(([,v])=>!v.gm||isM);
  const genList=()=>{const ag=VTM.AGES[D.age];const thin=VTM.CLANS[D.clan]?.thin;if(thin)return [14,15,16];if(free&&isM)return [4,5,6,7,8,9,10,11,12,13];return ag?.gen||[13,12]};
  const draw=()=>{
    stepsEl.innerHTML=STEPS.map((s,i)=>`<span class="${i===step?'on':i<step?'done':''}" data-go="${i}">${i+1}. ${s}</span>`).join('');
    el.querySelector('[data-back]').style.visibility=step?'visible':'hidden';el.querySelector('[data-next]').textContent=step===STEPS.length-1?'Создать персонажа':'Далее';err.textContent='';
    let h='';
    if(step===0){const ag=VTM.AGES[D.age];const g=VTM.GEN_BP[+D.gen]||[0,0];h=`<div class="wz-g2"><label class="f">Имя<input data-w="name" value="${esc(D.name)}" placeholder="Как вас зовут сородичи"></label><label class="f">Концепция<input data-w="concept" value="${esc(D.concept)}" placeholder="Например: детектив, потерявший веру"></label></div>
      ${isM?`<label class="f">Чей персонаж<select data-owner><option value="">Пока без игрока</option><option value="npc" ${npc?'selected':''}>Персонаж мастера (NPC)</option>${(mem||[]).filter(m=>m.role!=='comaster').map(m=>`<option value="${m.user_id}" ${owner===m.user_id?'selected':''}>${esc(m.profile?.name||'Игрок')}</option>`).join('')}</select></label>`:''}
      <div class="f">Клан</div><div class="clans">${Object.entries(VTM.CLANS).map(([k,v])=>`<button class="clan ${D.clan===k?'on':''}" data-clan="${k}"><b>${esc(v.n)}</b><small>${v.any?'любые две дисциплины':v.d.map(x=>VTM.DISC_ICON[x]+' '+VTM.DISC[x]).join(', ')}</small><small class="srcl">${esc(VTM.srcText(v.src))}</small></button>`).join('')}</div>
      ${D.clan?`<div class="bane"><b>Клановый изъян:</b> ${esc(VTM.CLANS[D.clan].bane)}<br><b>Побуждение:</b> ${esc(VTM.CLANS[D.clan].comp)}</div>`:''}
      ${isM?`<label class="f">Для игроков (до знакомства)<input data-w="alias" value="${esc(D.alias||'')}" placeholder="Например: Незнакомец в плаще — настоящее имя откроете кнопкой в листе или в меню фишки"></label>`:''}
      <div class="f">Внешность</div><div data-wlook>${lookEditor(D,pid,null,false)}</div>
      <div class="f">Время обращения (Море времени)</div><div class="ages">${ageList().map(([k,v])=>`<label class="pre ${v.gm?'gm':''}"><input type="radio" name="age" value="${k}" ${D.age===k?'checked':''}><span><b>${v.n}</b><small>${v.d}${v.xp?` · +${v.xp} опыта`:''}${v.adv?` · +${v.adv} к достоинствам и недостаткам`:''}${v.hum?` · Человечность ${v.hum}`:''}</small></span></label>`).join('')}</div>
      ${ag?.gm?`<p class="muted wz-p">Старейшин и мафусаилов официальные правила V5 не дают создавать игрокам — это персонажи мастера. Поколение и Сила крови — по таблице корбука (с. 213), за каждую точку Силы крови выше 5 — ещё одна сила дисциплины (Gehenna War). Опыт на развитие задайте сами ниже.</p>`:''}
      <div class="wz-g2"><label class="f">Поколение<select data-gen>${genList().map(gg=>`<option value="${gg}" ${+D.gen===gg?'selected':''}>${gg}-е · Сила крови ${VTM.GEN_BP[gg][0]}${VTM.GEN_BP[gg][1]>VTM.GEN_BP[gg][0]?'–'+VTM.GEN_BP[gg][1]:''}</option>`).join('')}</select></label>
      ${ag?.gm?`<label class="f">Сила крови<select data-bp>${R0(g[0],g[1]).map(b=>`<option value="${b}" ${+D.bp===b?'selected':''}>${b}</option>`).join('')}</select></label>`:`<div class="f">Сила крови: <b>${D.bp}</b></div>`}</div>
      ${ag?.gm?`<label class="f">Опыт на развитие<input type="number" data-xp min="0" step="5" value="${D._xp||0}"></label>`:''}
      <label class="ck"><input type="checkbox" data-free ${free?'checked':''}> Свободное создание (без проверки правил — для готовых или особых персонажей)</label>
      ${free?`<div class="wz-free"><b>Свободный режим.</b> Атрибуты, навыки, дисциплины, силы, достоинства и недостатки проставляются как угодно — без обязательных раскладок 4/3/3/3/2…, лимита сил и обязательного стиля охоты. Любые дисциплины доступны, а не только клановые.${ag?.gm?' Для старейшин и мафусаилов включён по умолчанию — снимите галочку, чтобы создавать по правилам.':''}
        <label class="f" style="margin:10px 0 0">Максимум точек в чертах<select data-wcap>${RNG(5,10).map(v=>`<option value="${v}" ${capV()===v?'selected':''}>${v===5?'5 (официально)':v+' (домашнее правило)'}</option>`).join('')}</select></label></div>`:''}`}
    if(step===1)h=`<p class="muted wz-p">Один атрибут на 4, три на 3, четыре на 2, один на 1. Здоровье = Выносливость + 3, Воля = Самообладание + Упорство.</p>${ATTR_ROWS()}<div class="wz-calc">Здоровье: <b>${VTM.healthMax(D)}</b> · Воля: <b>${VTM.wpMax(D)}</b></div>`;
    if(step===2){const sp=VTM.SKILL_SPREADS[D.spread].d,c=cntS();h=`<div class="spreads">${Object.entries(VTM.SKILL_SPREADS).map(([k,v])=>`<label class="pre"><input type="radio" name="spread" value="${k}" ${D.spread===k?'checked':''}><span><b>${v.name}</b><small>${v.hint}</small></span></label>`).join('')}</div>
      <div class="wz-cnt">${Object.keys(sp).sort((a,b)=>b-a).map(v=>`<span class="${(c[v]||0)===sp[v]?'ok':(c[v]||0)>sp[v]?'over':''}">на ${v}: ${c[v]||0}/${sp[v]}</span>`).join('')}</div>
      <div class="sh-cols">${VTM.SKILLS.map(([g,gn,l])=>`<div><h4>${gn}</h4>${l.map(([k,n])=>`<div class="trait sk"><span class="tn">${n}</span><span class="seg">${(free?RNG(0,capV()):[0,1,2,3,4]).map(v=>`<button data-skill="${k}" data-v="${v}" class="${(D.skills[k]||0)===v?'on':''}">${v||'–'}</button>`).join('')}</span>${(VTM.FREE_SPEC_SKILLS.includes(k)&&D.skills[k])?`<input class="spec" data-wspec="${k}" value="${esc(D.spec[k]||'')}" placeholder="обязательная специализация">`:''}</div>`).join('')}</div>`).join('')}</div>
      <label class="f" style="margin-top:12px">Ещё одна бесплатная специализация<span class="wz-g2"><select data-xspec><option value="">Навык…</option>${Object.entries(D.skills).filter(([,v])=>v>0).map(([k])=>`<option value="${k}" ${D._xs===k?'selected':''}>${VTM.SKILL_NAME[k]}</option>`).join('')}</select><input data-xspecv value="${esc(D._xs?D.spec[D._xs]||'':'')}" placeholder="Например: Ножи"></span></label>`}
    if(step===3)h=`<p class="muted wz-p">Стиль охоты — как персонаж добывает кровь. Даёт специализацию, точку дисциплины, достоинства и недостатки.</p><div class="preds">${Object.entries(VTM.PREDATORS).map(([k,p])=>{const no=(p.noClans||[]).includes(D.clan)||(p.maxBp&&D.bp>p.maxBp);return `<button class="pred ${D.predator===k?'on':''}" data-pred="${k}" ${no?'disabled title="Недоступно этому персонажу по правилам"':''}><b>${p.n} <span class="en">${p.en}</span></b><small>Охота: ${p.pool?`${VTM.traitName(p.pool[0])} + ${VTM.traitName(p.pool[1])}${p.pool2?` или ${VTM.traitName(p.pool2[0])} + ${VTM.traitName(p.pool2[1])}`:''}`:'без броска'}${p.hum?` · Человечность ${p.hum>0?'+':''}${p.hum}`:''}${p.bp?' · Сила крови +1':''}</small><small>${p.adv.map(a=>(a[2]?'− ':'+ ')+a[0]+' '+'●'.repeat(a[1])).join('<br>')}</small><small class="srcl">${esc(VTM.srcText(p.src))}${p.note?' · '+esc(p.note):''}</small></button>`}).join('')}</div>
      ${D.predator?(()=>{const p=VTM.PREDATORS[D.predator];const cl=VTM.CLANS[D.clan];const dd=p.disc.filter(x=>(x!=='bloodsorcery'||['tremere','banuhaqim'].includes(D.clan))&&(x!=='oblivion'||D.predator!=='bagger'||D.clan==='hecata'));return `<div class="wz-g2"><label class="f">Специализация<select data-pspec><option value="">—</option>${p.spec.map(([s,n],i)=>`<option value="${i}" ${predSpec===String(i)?'selected':''}>${VTM.SKILL_NAME[s]} (${n})</option>`).join('')}</select></label>${cl?.thin?'':`<label class="f">Точка дисциплины<select data-pdisc><option value="">—</option>${dd.map(x=>`<option value="${x}" ${predDisc===x?'selected':''}>${VTM.DISC[x]}</option>`).join('')}</select></label>`}</div>${p.discNote?`<p class="muted wz-p">${esc(p.discNote)}</p>`:''}`})():''}`;
    if(step===4){const cl=VTM.CLANS[D.clan];const pool=cl.any||free?Object.keys(VTM.DISC).filter(k=>k!=='alchemy'||cl.thin):cl.d;const ex=VTM.extraPowers(D);
      h=cl.thin?`<p class="muted wz-p">У слабокровных нет врождённых дисциплин. Алхимию слабокровных берут через достоинство «Алхимик слабой крови».</p>`:`<p class="muted wz-p">${cl.any?'Каитифф выбирает любые две дисциплины':'Выберите две клановые дисциплины'}: одну на 2, другую на 1.${predDisc?` Точка от стиля охоты: ${VTM.DISC[predDisc]} +1.`:''} На каждую точку — одна сила уровня не выше рейтинга.${ex?` Сила крови ${D.bp}: ещё ${ex} ${plural(ex,'сила','силы','сил')} (Gehenna War).`:''}</p>
      <div class="wdiscs">${[...new Set([...pool,...(predDisc?[predDisc]:[])])].map(k=>{const base=(D.disc[k]||0)-(k===predDisc?1:0);const mine=D.powers.filter(id=>VTM.POWER[id].disc===k);return `<div class="wdisc"><div class="disc-h"><span class="di">${VTM.DISC_ICON[k]}</span><b>${VTM.DISC[k]}</b><span class="seg">${(free?RNG(0,capV()):pool.includes(k)?[0,1,2]:[0]).map(v=>`<button data-wd="${k}" data-v="${v}" class="${base===v?'on':''}">${v}</button>`).join('')}</span>${k===predDisc?'<span class="tag">+1 стиль охоты</span>':''}</div>${D.disc[k]?`<div class="pw">${mine.map(id=>`<span class="pwb">${VTM.POWER[id].l} · ${esc(VTM.POWER[id].n)}<i data-wunpw="${id}">✕</i></span>`).join('')}<button class="pwb add" data-wpw="${k}">+ сила</button></div>`:''}</div>`}).join('')}</div>
      <div class="wz-cnt"><span class="${D.powers.length===Object.values(D.disc).reduce((s,v)=>s+v,0)+ex?'ok':''}">сил выбрано: ${D.powers.length} из ${Object.values(D.disc).reduce((s,v)=>s+v,0)+ex}</span></div>`}
    if(step===5){const {a,f,na,nf}=flawOk();
      h=`<p class="muted wz-p">Потратьте ${na} точек на достоинства и возьмите ${nf} точки недостатков — сверх тех, что дал стиль охоты. Одно и то же достоинство дважды брать нельзя (кроме отмеченных «можно несколько» — например, разные Союзники или Контакты).</p><div class="wz-cnt"><span class="${a===na?'ok':a>na?'over':''}">достоинства ${a}/${na}</span><span class="${f===nf?'ok':f>nf?'over':''}">недостатки ${f}/${nf}</span></div>
      <div class="advs">${D.adv.map((x,i)=>{const m=VTM.MERIT[x.n];const allowed=m?m.dots:[1,2,3,4,5];return `<div class="adv ${x.flaw?'flaw':''}"><input data-wadv="${i}" value="${esc(x.n)}" ${x.pred||m?'readonly':''}>${m?.rep?`<input class="advnote" data-wnote="${i}" value="${esc(x.note||'')}" placeholder="уточнение (кто/что)">`:''}<span class="seg">${allowed.map(v=>`<button data-wadvd="${i}" data-v="${v}" class="${x.dots===v?'on':''}" ${x.pred||allowed.length<2?'disabled':''}>${v}</button>`).join('')}</span>${x.pred?'<span class="tag">стиль охоты</span>':`<button class="x" data-wadvdel="${i}">✕</button>`}</div>`}).join('')}</div>
      <button class="btn" data-wmerit>+ Выбрать из списка V5</button>`}
    if(step===6)h=`<p class="muted wz-p">Принципы — моральные убеждения персонажа; к каждому — опора, живой человек, связанный с ним. Человечность: <b>${D.humanity}</b>.</p>
      <div class="convs">${D.conv.map((v,i)=>`<div class="conv"><input data-wconv="${i}" data-k="c" value="${esc(v.c)}" placeholder="Принцип"><input data-wconv="${i}" data-k="t" value="${esc(v.t)}" placeholder="Опора"><button class="x" data-wconvdel="${i}">✕</button></div>`).join('')}${D.conv.length<3?'<button class="btn sm" data-wconvadd>+ Принцип</button>':''}</div>
      <div class="wz-g2" style="margin-top:12px"><label class="f">Цель<input data-w="ambition" value="${esc(D.ambition)}" placeholder="Долгосрочная цель"></label><label class="f">Прихоть<input data-w="desire" value="${esc(D.desire)}" placeholder="Желание на ближайшую сессию"></label></div>
      <label class="f">Сир<input data-w="sire" value="${esc(D.sire)}"></label>
      <div class="chk">${VTM.check(D).map(([ok,t,s])=>`<div class="${ok?'ok':'bad'}">${ok?'✓':'•'} ${esc(t)} <small>${esc(s)}</small></div>`).join('')}</div>`;
    body.innerHTML=h;
  };
  const R0=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
  el.addEventListener('input',e=>{const t=e.target;
    if(t.dataset.w!==undefined)D[t.dataset.w]=t.value;
    if(t.dataset.wspec)D.spec[t.dataset.wspec]=t.value;
    if(t.dataset.xspecv!==undefined&&D._xs)D.spec[D._xs]=t.value;
    if(t.dataset.wadv!==undefined)D.adv[+t.dataset.wadv].n=t.value;
    if(t.dataset.wnote!==undefined)D.adv[+t.dataset.wnote].note=t.value;
    if(t.dataset.wconv!==undefined)D.conv[+t.dataset.wconv][t.dataset.k]=t.value;
    if(t.dataset.xp!==undefined)D._xp=Math.max(0,+t.value||0);
  });
  el.addEventListener('change',e=>{const t=e.target;
    if(t.name==='age'){const was=!!VTM.AGES[D.age]?.gm;D.age=t.value;const ag=VTM.AGES[t.value];if(ag.gm){free=true;if(!D.cap||D.cap<5)D.cap=5}else if(was){free=false;D.cap=5}if(!VTM.CLANS[D.clan]?.thin)D.gen=ag.gen[0];D._bp=null;applyPred();draw()}
    if(t.dataset.gen!==undefined){D.gen=+t.value;D._bp=null;applyPred();draw()}
    if(t.dataset.bp!==undefined){D._bp=+t.value;applyPred();draw()}
    if(t.dataset.free!==undefined){free=t.checked;if(!free){D.cap=5;for(const k in D.attr)D.attr[k]=Math.min(5,D.attr[k]);for(const k in D.skills)D.skills[k]=Math.min(4,D.skills[k])}draw()}
    if(t.dataset.wcap!==undefined){D.cap=+t.value;draw()}
    if(t.dataset.owner!==undefined){npc=t.value==='npc';owner=npc?'':t.value}
    if(t.name==='spread'){D.spread=t.value;draw()}
    if(t.dataset.xspec!==undefined){if(D._xs&&D._xs!==t.value)delete D.spec[D._xs];D._xs=t.value;draw()}
    if(t.dataset.pspec!==undefined){const p=VTM.PREDATORS[D.predator];if(predSpec!==''){const [s,n]=p.spec[+predSpec];if(D.spec[s]===n)delete D.spec[s]}predSpec=t.value;if(t.value!==''){const [s,n]=p.spec[+t.value];D.spec[s]=n;if(!D.skills[s]&&!free)toast(`Специализация «${n}» сработает, если вложить хотя бы 1 точку в «${VTM.SKILL_NAME[s]}»`)}}
    if(t.dataset.pdisc!==undefined){if(predDisc){D.disc[predDisc]=(D.disc[predDisc]||1)-1;if(!D.disc[predDisc])delete D.disc[predDisc];trimPowers()}predDisc=t.value;if(predDisc)D.disc[predDisc]=(D.disc[predDisc]||0)+1}
  });
  const trimPowers=()=>{for(const k of Object.keys(VTM.DISC)){const lim=D.disc[k]||0;D.powers.filter(id=>VTM.POWER[id].disc===k&&VTM.POWER[id].l>lim).forEach(id=>D.powers.splice(D.powers.indexOf(id),1))}
    if(free)return;const tot=Object.values(D.disc).reduce((s,v)=>s+v,0)+VTM.extraPowers(D);while(D.powers.length>tot)D.powers.pop()};
  el.addEventListener('click',e=>{const t=e.target.closest('button,[data-go]');if(!t)return;
    if(t.dataset.go!==undefined&&t.tagName==='SPAN'){const to=+t.dataset.go;if(to<step||free){step=to;draw()}return}
    if(t.dataset.clan){if(D.clan!==t.dataset.clan){D.clan=t.dataset.clan;D.disc={};D.powers=[];predDisc='';if(VTM.CLANS[D.clan].thin)D.gen=14;else if(D.gen>13)D.gen=VTM.AGES[D.age].gen[0];D._bp=null;applyPred()}draw();return}
    if(t.dataset.attr){D.attr[t.dataset.attr]=+t.dataset.v;draw();return}
    if(t.dataset.skill){const v=+t.dataset.v;if(v)D.skills[t.dataset.skill]=v;else delete D.skills[t.dataset.skill];draw();return}
    if(t.dataset.pred){if(predDisc){D.disc[predDisc]--;if(!D.disc[predDisc])delete D.disc[predDisc];predDisc=''}if(predSpec!==''){const p=VTM.PREDATORS[D.predator];const [s,n]=p.spec[+predSpec];if(D.spec[s]===n)delete D.spec[s];predSpec=''}D.predator=t.dataset.pred;applyPred();trimPowers();draw();return}
    if(t.dataset.wd){const k=t.dataset.wd,v=+t.dataset.v;const extra=k===predDisc?1:0;if(v+extra)D.disc[k]=v+extra;else delete D.disc[k];trimPowers();draw();return}
    if(t.dataset.wpw){const k=t.dataset.wpw;pickPower({data:D},k,(id,b)=>{const tot=free?Infinity:Object.values(D.disc).reduce((s,v)=>s+v,0)+VTM.extraPowers(D);if(D.powers.includes(id)){D.powers.splice(D.powers.indexOf(id),1);b.classList.remove('on')}else if(D.powers.length<tot){D.powers.push(id);b.classList.add('on')}else toast('Сил уже столько, сколько положено');draw()},isM);return}
    if(t.dataset.wunpw){D.powers.splice(D.powers.indexOf(t.dataset.wunpw),1);draw();return}
    if(t.dataset.wmerit!==undefined){pickMerit(D.adv,m=>{D.adv.push(m);draw()});return}
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
    const data=clone(D);delete data._xs;delete data._bp;const xpExtra=data._xp||0;delete data._xp;data.adv=data.adv.filter(a=>a.n.trim());data.adv.forEach(a=>delete a.pred);
    for(const k of Object.keys(data.spec))if(!data.spec[k]||!data.skills[k])delete data.spec[k];
    data.hunger=1;data.xp={total:(VTM.AGES[D.age]?.xp||0)+xpExtra,spent:0};
    if(!isM){owner=App.user.id;npc=false}
    const btn=el.querySelector('[data-next]');btn.disabled=true;
    const c=await App.chars.create(data,{owner:owner||null,npc});btn.disabled=false;
    if(c){close();toast(`Персонаж «${c.name}» создан`);onDone?.(c)}
  };
  applyPred();draw();
}


/* ---------- внешность: портрет и значок фишки на карте ---------- */
const TOKEN_EMOJI=['🧛','🦇','🐺','🌹','🗡️','🔮','💀','👁️','🩸','🕯️','🎭','👑','🐍','🕷️','🦉','🐀','🔥','⚡','🌙','⭐','🃏','🎩','💼','🔫','🛡️','⚔️','🌑','🌫️','🎻','🍷','🗝️','📿','🧪','📜','🪦','⛓️'];
const TOK_COLORS=()=>typeof TOKEN_COLORS!=='undefined'?TOKEN_COLORS:['#e3b75b','#ef4444','#3b82f6','#22c55e','#a855f7','#f97316','#14b8a6','#ec4899','#64748b','#1f2937'];
/* как персонаж выглядит на карте и в списках */
function charLook(c){const d=c?.data||{};const ic=d.icon||(d.portrait?'portrait':'init');
  return {img:ic==='portrait'&&d.portrait?d.portrait:null,emoji:ic!=='portrait'&&ic!=='init'?ic:null,init:(c?.name||d.name||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?',color:d.tcolor||null,portrait:d.portrait||null,name:c?.name||d.name||''}}
function charAvatar(c,cls='cav'){const L=charLook(c);return `<span class="${cls}" style="${L.color?`--tc:${L.color};`:''}${L.portrait?`background-image:url('${esc(L.portrait)}')`:''}">${L.portrait?'':L.emoji?L.emoji:esc(L.init.slice(0,1))}</span>`}
/* блок выбора: d — данные персонажа (объект), set(patch) — сохранить */
function lookEditor(d,pid,set,ro){
  const ic=d.icon||(d.portrait?'portrait':'init');
  const prevC={data:d,name:d.name};const L=charLook(prevC);
  const tok=`<span class="lk-tok" style="--tc:${d.tcolor||'#e3b75b'};${L.img?`background-image:url('${esc(L.img)}')`:''}">${L.img?'':L.emoji?L.emoji:esc(L.init)}</span>`;
  return `<div class="lk ${ro?'ro':''}">
    <div class="lk-por"><div class="lk-img" style="${d.portrait?`background-image:url('${esc(d.portrait)}')`:''}">${d.portrait?'':'<span>🧛</span>'}</div>
      ${ro?'':`<div class="lk-btns"><label class="btn sm">${d.portrait?'Заменить':'Загрузить портрет'}<input type="file" accept="image/*" hidden data-lkfile></label><button type="button" class="btn sm ghost" data-lkurl>Ссылка</button>${d.portrait?'<button type="button" class="btn sm ghost" data-lkdel>Убрать</button>':''}</div>`}</div>
    <div class="lk-icon"><div class="lk-l">Значок на карте ${tok}</div>
      ${ro?'':`<div class="lk-opts"><button type="button" data-lkic="portrait" class="${ic==='portrait'?'on':''}" ${d.portrait?'':'disabled title="Сначала загрузите портрет"'}>Портрет</button><button type="button" data-lkic="init" class="${ic==='init'?'on':''}">Инициалы</button></div>
      <div class="lk-emo">${TOKEN_EMOJI.map(e=>`<button type="button" data-lkic="${e}" class="${ic===e?'on':''}">${e}</button>`).join('')}</div>
      <div class="lk-cols">${TOK_COLORS().map(c=>`<button type="button" data-lkcol="${c}" class="${(d.tcolor||'#e3b75b')===c?'on':''}" style="background:${c}" title="Цвет фишки"></button>`).join('')}</div>`}
    </div></div>`;
}
function bindLookEditor(root,pid,set){
  root.addEventListener('click',async e=>{const b=e.target.closest('[data-lkic],[data-lkcol],[data-lkurl],[data-lkdel]');if(!b||!root.contains(b))return;
    if(b.dataset.lkic)set({icon:b.dataset.lkic});
    if(b.dataset.lkcol)set({tcolor:b.dataset.lkcol});
    if(b.dataset.lkdel!==undefined)set({portrait:null,icon:'init'});
    if(b.dataset.lkurl!==undefined){const u=prompt('Ссылка на картинку (https://…)');if(u&&/^https?:\/\//.test(u.trim()))set({portrait:u.trim(),icon:'portrait'})}});
  root.addEventListener('change',async e=>{if(e.target.dataset.lkfile===undefined)return;const f=e.target.files[0];if(!f)return;
    toast('Загружаю портрет…');try{const {blob,ext}=await loadImage(f);const src=await API.upload(pid,blob,ext);set({portrait:src,icon:'portrait'})}catch(_){toast('Не удалось загрузить картинку','err')}});
}
function openLookModal(c){const S=App.chars;
  const {el,close}=openModal(`<h3>Внешность — ${esc(c.name)}</h3><div data-lkh></div><div class="modal-actions"><button class="btn primary" data-close>Готово</button></div>`);
  const host=el.querySelector('[data-lkh]');const draw=()=>{const cc=S.get(c.id);host.innerHTML=lookEditor(cc.data,cc.project_id,null,false)};draw();
  bindLookEditor(host,c.project_id,p=>{S.patch(c.id,p).then(draw);setTimeout(draw,30)});
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
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
    el.innerHTML=`<div class="mc-h" title="Перетащите, чтобы передвинуть · двойной щелчок — на место"><span class="mc-grip" aria-hidden="true">⠿</span><button class="mc-tg" data-tg title="${open?'Свернуть':'Развернуть'}">${open?'▾':'▸'}</button>${c?`<button class="mc-tg mc-sheet" data-sheet title="Открыть полный лист персонажа">📜</button>`:''}${all.length>1?`<select data-mc>${all.map(x=>`<option value="${x.id}" ${x.id===cur?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`:`<b>${esc(c.name)}</b>`}<span class="mc-hun" title="Голод">${boxes('hunger',c)}</span></div>
    ${open?`<div class="mc-b"><div class="mc-tr"><span title="Здоровье">❤</span>${boxes('health',c)}</div><div class="mc-tr"><span title="Воля">✦</span>${boxes('wp',c)}</div>
      <div class="mc-q">${QUICK_ROLLS.map(([n,a,b,ic])=>`<button data-q="${a}|${b}|${n}" title="${VTM.ATTR_NAME[a]} + ${VTM.SKILL_NAME[b]} = ${VTM.val(d,a)+VTM.val(d,b)}"><span>${ic}</span>${n}<b>${VTM.val(d,a)+VTM.val(d,b)}</b></button>`).join('')}</div>
      ${known.length?`<div class="mc-l">Силы</div><div class="mc-p">${known.map(p=>`<button data-pw="${p.id}" title="${esc(p.d)}${p.vs?' · против '+esc(p.vs):''}"><span>${VTM.DISC_ICON[p.disc]}</span>${esc(p.n)}${p.r?`<i>${'🩸'.repeat(p.r)}</i>`:''}</button>`).join('')}</div>`:''}
      <div class="mc-f"><button class="btn sm" data-rouse title="Бросок на голод">🩸 Бросок на голод</button><button class="btn primary sm" data-roll>🎲 Свой бросок</button></div></div>`:''}`;
  };
  el.onclick=e=>{const t=e.target;const c=cur&&S.get(cur);
    if(t.closest('[data-tg]')){open=!open;LS.set('rpa_mchar_open',open?'1':'0');draw();return place()}
    if(!c)return;
    if(t.closest('[data-sheet]'))return openSheetModal(c.id);
    const bx=t.closest('[data-box] i');if(bx&&S.canEdit(c))return S.patch(c.id,cycleBox(c,bx.parentElement.dataset.box,+bx.dataset.i));
    const q=t.closest('[data-q]');if(q){const [a,b,n]=q.dataset.q.split('|');return openRollDialog(c,{a,b,label:n})}
    const pw=t.closest('[data-pw]');if(pw)return usePower(c,pw.dataset.pw);
    if(t.closest('[data-rouse]'))return rouseCheck(c);
    if(t.closest('[data-roll]'))return openRollDialog(c,{a:'dex',b:'athletics'});
  };
  el.onchange=e=>{if(e.target.dataset.mc!==undefined){cur=e.target.value;LS.set('rpa_mchar_'+mv.ctx.pid,cur);draw();place()}};
  el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('wheel',e=>e.stopPropagation());
  // перетаскивание за шапку: панель можно поставить в любое место карты, позиция запоминается
  let P=null;try{P=JSON.parse(LS.get('rpa_mchar_pos')||'null')}catch(_){P=null}
  const place=()=>{if(!P){el.style.left=el.style.top='';el.style.bottom='';return}
    const W=wrap.clientWidth,H=wrap.clientHeight,w=el.offsetWidth;
    const x=Math.max(0,Math.min(W-w,P.x)),y=Math.max(0,Math.min(H-44,P.y));el.style.left=x+'px';el.style.top=y+'px';el.style.bottom='auto'};
  let dr=null;
  el.addEventListener('pointerdown',e=>{const h=e.target.closest('.mc-h');if(!h||e.button!==0||e.target.closest('button,select,input,[data-box]'))return;
    const r=el.getBoundingClientRect(),wr=wrap.getBoundingClientRect();dr={dx:e.clientX-r.left,dy:e.clientY-r.top,wr};el.classList.add('drag');el.setPointerCapture(e.pointerId);e.preventDefault()});
  el.addEventListener('pointermove',e=>{if(!dr)return;P={x:e.clientX-dr.wr.left-dr.dx,y:e.clientY-dr.wr.top-dr.dy};place()});
  const end=()=>{if(!dr)return;dr=null;el.classList.remove('drag');const x=parseFloat(el.style.left)||0,y=parseFloat(el.style.top)||0;P={x,y};LS.set('rpa_mchar_pos',JSON.stringify(P))};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('dblclick',e=>{const hh=el.querySelector('.mc-h');if(!hh||e.clientY>hh.getBoundingClientRect().bottom||e.target.closest('button,select'))return;P=null;LS.set('rpa_mchar_pos',null);place()});
  const ro=window.ResizeObserver?new ResizeObserver(place):null;ro&&ro.observe(wrap);
  const draw2=()=>{draw();place()};
  const off=S.on(()=>draw2());S.ready.then(draw2);
  return ()=>{off();ro&&ro.disconnect();el.remove()};
}

/* полный лист персонажа поверх любого экрана (сессия, карта) */
async function openSheetModal(id){
  const S=App.chars;if(!S)return;let c=S.get(id);if(!c)return;
  document.querySelector('.sheetov')?.remove();
  const ov=document.createElement('div');ov.className='sheetov';
  ov.innerHTML=`<div class="sheetov-box"><div class="sheetov-h"><b>${esc(c.name)}</b><span class="muted">изменения сразу видят мастер и игрок</span><span class="spacer"></span><button class="btn sm" data-x title="Закрыть (Esc)">✕ Закрыть</button></div><div class="sheetov-b csheet"></div></div>`;
  document.body.appendChild(ov);
  const body=ov.querySelector('.sheetov-b');
  const mem=S.isM?await API.members(c.project_id).catch(()=>[]):[];
  const draw=()=>{c=S.get(id);if(!c)return close();ov.querySelector('.sheetov-h b').textContent=c.name;const y=body.scrollTop;renderSheet(body,c,S.isM,mem);body.scrollTop=y};
  let pend=false;
  const off=S.on(x=>{if(x&&x!==id)return;const a=document.activeElement;
    if(a&&body.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){if(!pend){pend=true;a.addEventListener('blur',()=>{pend=false;setTimeout(()=>{if(ov.isConnected)draw()},50)},{once:true})}}else draw()});
  const key=e=>{if(e.key==='Escape'&&!document.querySelector('.modal-bg'))close()};
  function close(){off();document.removeEventListener('keydown',key);ov.remove()}
  ov.querySelector('[data-x]').onclick=close;
  ov.addEventListener('pointerdown',e=>{if(e.target===ov)close()});
  document.addEventListener('keydown',key);
  ['pointerdown','wheel','keydown'].forEach(t=>ov.addEventListener(t,e=>e.stopPropagation()));
  draw();
}

/* ---------- импорт / экспорт персонажей ---------- */
const CH_EN={attr:{str:'Strength',dex:'Dexterity',sta:'Stamina',cha:'Charisma',man:'Manipulation',com:'Composure',int:'Intelligence',wit:'Wits',res:'Resolve'},
  skill:{athletics:'Athletics',brawl:'Brawl',craft:'Craft',drive:'Drive',firearms:'Firearms',larceny:'Larceny',melee:'Melee',stealth:'Stealth',survival:'Survival',animalken:'Animal Ken',etiquette:'Etiquette',insight:'Insight',intimidation:'Intimidation',leadership:'Leadership',performance:'Performance',persuasion:'Persuasion',streetwise:'Streetwise',subterfuge:'Subterfuge',academics:'Academics',awareness:'Awareness',finance:'Finance',investigation:'Investigation',medicine:'Medicine',occult:'Occult',politics:'Politics',science:'Science',technology:'Technology'},
  clan:{brujah:'Brujah',gangrel:'Gangrel',malkavian:'Malkavian',nosferatu:'Nosferatu',toreador:'Toreador',tremere:'Tremere',ventrue:'Ventrue',banuhaqim:'Banu Haqim',ministry:'The Ministry',lasombra:'Lasombra',hecata:'Hecata',ravnos:'Ravnos',salubri:'Salubri',tzimisce:'Tzimisce',caitiff:'Caitiff',thinblood:'Thin-blood'},
  age:{childer:'Childer',neonate:'Neonate',ancilla:'Ancilla',elder:'Elder',methuselah:'Methuselah'}};
const nrm=s=>String(s??'').toLowerCase().replace(/ё/g,'е').replace(/^the\s+/,'').replace(/[^a-zа-я0-9]+/g,'');
/* словари «любое написание → id» */
let _chIdx=null;
function chIdx(){if(_chIdx)return _chIdx;const mk=()=>new Map(),I={attr:mk(),skill:mk(),disc:mk(),clan:mk(),pred:mk(),power:mk(),rite:mk(),merit:mk(),age:mk()};
  const put=(m,id,...names)=>{for(const n of [id,...names])if(n)m.set(nrm(n),id)};
  for(const [k,n] of Object.entries(VTM.ATTR_NAME))put(I.attr,k,n,CH_EN.attr[k]);
  for(const [k,n] of Object.entries(VTM.SKILL_NAME))put(I.skill,k,n,CH_EN.skill[k]);
  for(const [k,n] of Object.entries(VTM.DISC))put(I.disc,k,n,VTM.DISC_EN[k]);
  for(const [k,c] of Object.entries(VTM.CLANS))put(I.clan,k,c.n,CH_EN.clan[k]);put(I.clan,'ministry','Ministry','Министерство Сета','Последователи Сета','Setite');
  for(const [k,p] of Object.entries(VTM.PREDATORS))put(I.pred,k,p.n,p.en);
  for(const p of Object.values(VTM.POWER))if(p)put(I.power,p.id,p.n,p.en);
  for(const r of Object.values(VTM.RITE))put(I.rite,r.id,r.n,r.en);
  for(const m of VTM.MERITS)put(I.merit,m.n,m.n,m.en);
  for(const [k,a] of Object.entries(VTM.AGES))put(I.age,k,a.n,CH_EN.age[k],CH_EN.age[k]+'s',CH_EN.age[k]==='Ancilla'?'Ancillae':'');
  return _chIdx=I}
const EN=()=>typeof I18N!=='undefined'&&I18N.lang==='en';
/* персонаж → понятный JSON (названия на текущем языке) + точная копия данных */
function charToJSON(c){const d={...VTM.blank(),...c.data},en=EN();
  const A=k=>en?CH_EN.attr[k]:VTM.ATTR_NAME[k],Sk=k=>en?CH_EN.skill[k]:VTM.SKILL_NAME[k],Dn=k=>en?VTM.DISC_EN[k]:VTM.DISC[k];
  const o={format:'rpassistant-character',version:1,system:'vtm5',
    name:c.name||d.name,concept:d.concept,clan:VTM.CLANS[d.clan]?(en?CH_EN.clan[d.clan]:VTM.CLANS[d.clan].n):'',predator:VTM.PREDATORS[d.predator]?(en?VTM.PREDATORS[d.predator].en:VTM.PREDATORS[d.predator].n):'',
    generation:+d.gen,blood_potency:+d.bp,age:VTM.AGES[d.age]?(en?CH_EN.age[d.age]:VTM.AGES[d.age].n):'',sire:d.sire,chronicle:d.chronicle,ambition:d.ambition,desire:d.desire,
    attributes:Object.fromEntries(Object.keys(VTM.ATTR_NAME).map(k=>[A(k),+(d.attr?.[k]||1)])),
    skills:Object.fromEntries(Object.keys(VTM.SKILL_NAME).filter(k=>d.skills?.[k]).map(k=>[Sk(k),+d.skills[k]])),
    specialties:Object.fromEntries(Object.entries(d.spec||{}).filter(([k,v])=>v&&VTM.SKILL_NAME[k]).map(([k,v])=>[Sk(k),v])),
    disciplines:Object.fromEntries(Object.entries(d.disc||{}).filter(([k,v])=>v&&VTM.DISC[k]).map(([k,v])=>[Dn(k),+v])),
    powers:(d.powers||[]).map(id=>VTM.POWER[id]).filter(Boolean).map(p=>en?p.en:p.n),
    rituals:(d.rites||[]).map(id=>VTM.RITE[id]).filter(Boolean).map(r=>en?r.en:r.n),
    merits:(d.adv||[]).map(a=>({name:en&&VTM.MERIT[a.n]?VTM.MERIT[a.n].en:a.n,dots:+a.dots||1,flaw:!!a.flaw,...(a.note?{note:a.note}:{})})),
    convictions:(d.conv||[]).map(v=>({conviction:v.c,touchstone:v.t})),
    humanity:+d.humanity,stains:+d.stains||0,skill_spread:d.spread||'balanced',hunger:+d.hunger,health:d.health,willpower:d.wp,xp:d.xp,max_dots:VTM.cap(d),notes:d.notes,portrait:d.portrait||'',icon:d.icon||'',token_color:d.tcolor||''};
  return o}
/* понятный JSON → данные листа; warn собирает нераспознанное */
function jsonToChar(o,warn){
  if(o&&o._data&&typeof o._data==='object'){const d={...VTM.blank(),...o._data};if(o.name)d.name=o.name;return d}
  const I=chIdx(),d=VTM.blank(),W=(what,v)=>warn.push(`${what}: «${v}»`);
  const id=(m,v,what)=>{if(v==null||v==='')return '';const r=m.get(nrm(v));if(!r)W(what,v);return r||''};
  d.name=String(o.name||'').trim()||'Безымянный';d.concept=o.concept||'';d.sire=o.sire||'';d.chronicle=o.chronicle||'';d.ambition=o.ambition||'';d.desire=o.desire||'';d.notes=o.notes||'';
  d.clan=id(I.clan,o.clan,'клан');d.predator=id(I.pred,o.predator,'стиль охоты');const ag=id(I.age,o.age,'возраст');if(ag)d.age=ag;
  if(o.generation)d.gen=Math.max(4,Math.min(16,parseInt(o.generation)||13));if(o.blood_potency!=null)d.bp=Math.max(0,Math.min(10,+o.blood_potency||0));
  if(o.max_dots)d.cap=Math.max(5,Math.min(10,+o.max_dots));
  for(const [k,v] of Object.entries(o.attributes||{})){const a=id(I.attr,k,'атрибут');if(a)d.attr[a]=Math.max(0,Math.min(10,+v||0))}
  for(const [k,v] of Object.entries(o.skills||{})){const a=id(I.skill,k,'навык');if(a&&+v)d.skills[a]=Math.max(0,Math.min(10,+v))}
  for(const [k,v] of Object.entries(o.specialties||{})){const a=id(I.skill,k,'специализация для навыка');if(a&&v)d.spec[a]=String(v)}
  for(const [k,v] of Object.entries(o.disciplines||{})){const a=id(I.disc,k,'дисциплина');if(a&&+v)d.disc[a]=Math.max(0,Math.min(10,+v))}
  for(const p of o.powers||[]){const a=id(I.power,p,'сила');if(a&&!d.powers.includes(a))d.powers.push(a)}
  for(const p of o.rituals||[]){const a=id(I.rite,p,'ритуал');if(a&&!d.rites.includes(a))d.rites.push(a)}
  for(const m of o.merits||[]){const name=typeof m==='string'?m:m.name;if(!name)continue;const k=I.merit.get(nrm(name));const cat=k&&VTM.MERIT[k];
    d.adv.push({n:k||String(name),dots:Math.max(1,Math.min(6,+(m.dots||1))),flaw:cat?cat.flaw:!!m.flaw,...(m.note?{note:String(m.note)}:{})})}
  d.conv=(o.convictions||[]).slice(0,3).map(v=>typeof v==='string'?{c:v,t:''}:{c:v.conviction||v.c||'',t:v.touchstone||v.t||''});
  if(o.humanity!=null)d.humanity=Math.max(0,Math.min(10,+o.humanity));if(o.stains!=null)d.stains=+o.stains||0;if(o.hunger!=null)d.hunger=Math.max(0,Math.min(5,+o.hunger));
  if(o.health&&typeof o.health==='object')d.health={s:+o.health.s||0,a:+o.health.a||0};if(o.willpower&&typeof o.willpower==='object')d.wp={s:+o.willpower.s||0,a:+o.willpower.a||0};
  if(o.xp&&typeof o.xp==='object')d.xp={total:+o.xp.total||0,spent:+o.xp.spent||0};
  if(o.skill_spread&&VTM.SKILL_SPREADS[o.skill_spread])d.spread=o.skill_spread;
  if(o.portrait)d.portrait=String(o.portrait);if(o.icon)d.icon=String(o.icon);if(o.token_color)d.tcolor=String(o.token_color);
  return d}
const fileName=s=>String(s||'character').replace(/[\\/:*?"<>|]+/g,'_').slice(0,60);
function exportChars(list){if(!list.length)return toast('Нет персонажей для экспорта','err');
  const arr=list.map(charToJSON);
  if(arr.length===1)download(`${fileName(arr[0].name)}.character.json`,JSON.stringify(arr[0],null,2));
  else download(`characters-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({format:'rpassistant-characters',version:1,characters:arr},null,2));
  toast(arr.length===1?'Персонаж сохранён в файл':`Сохранено персонажей: ${arr.length}`)}
function charTemplate(){const en=EN();
  const ex=en?{name:'Marcus Vale',concept:'Bitter ex-boxer turned debt collector',clan:'Brujah',predator:'Alleycat',generation:12,blood_potency:1,age:'Neonate',sire:'Rosa “Red” Delgado',chronicle:'',ambition:'Own the club where I was Embraced',desire:'Make the bouncer apologise',
      attributes:{Strength:4,Dexterity:3,Stamina:3,Charisma:2,Manipulation:2,Composure:2,Intelligence:1,Wits:3,Resolve:2},skills:{Athletics:2,Brawl:3,Intimidation:3,Streetwise:2,Drive:1,Firearms:1,Insight:1,Persuasion:2,Awareness:2,Leadership:1,Subterfuge:1,Investigation:1,Etiquette:1,Larceny:1,Stealth:1},specialties:{Brawl:'Grappling',Intimidation:'Mugging'},
      disciplines:{Potence:2,Celerity:1,Presence:1},powers:['Lethal Body','Prowess','Cat\'s Grace','Awe'],rituals:[],merits:[{name:'Contacts',dots:3,note:'criminal'},{name:'Resources',dots:2},{name:'Haven',dots:2},{name:'Enemy',dots:2,flaw:true}],
      convictions:[{conviction:'Never hit someone who can\'t hit back',touchstone:'Leo, his kid brother'}],humanity:6,hunger:1,xp:{total:15,spent:0},notes:'',portrait:'',icon:'🥊',token_color:'#ef4444'}
    :{name:'Марк Вейл',concept:'Озлобленный бывший боксёр, выбивающий долги',clan:'Бруха',predator:'Налётчик',generation:12,blood_potency:1,age:'Неонаты',sire:'Роза «Рыжая» Дельгадо',chronicle:'',ambition:'Стать хозяином клуба, где меня обратили',desire:'Заставить вышибалу извиниться',
      attributes:{'Сила':4,'Ловкость':3,'Выносливость':3,'Обаяние':2,'Манипуляция':2,'Самообладание':2,'Интеллект':1,'Смекалка':3,'Упорство':2},skills:{'Атлетика':2,'Драка':3,'Запугивание':3,'Уличное чутьё':2,'Вождение':1,'Стрельба':1,'Проницательность':1,'Убеждение':2,'Наблюдательность':2,'Лидерство':1,'Хитрость':1,'Расследование':1,'Этикет':1,'Воровство':1,'Скрытность':1},specialties:{'Драка':'Захваты','Запугивание':'Грабёж'},
      disciplines:{'Мощь':2,'Стремительность':1,'Величие':1},powers:['Смертоносность','Сокрушение','Кошачья грация','Благоговение'],rituals:[],merits:[{name:'Контакты',dots:3,note:'преступный мир'},{name:'Ресурсы',dots:2},{name:'Убежище',dots:2},{name:'Враг',dots:2,flaw:true}],
      convictions:[{conviction:'Никогда не бить тех, кто не может ответить',touchstone:'Лео, младший брат'}],humanity:6,hunger:1,xp:{total:15,spent:0},notes:'',portrait:'',icon:'🥊',token_color:'#ef4444'};
  const help=en?['RPAssistant character template (Vampire: The Masquerade V5). Fill in the fields and import the file in the Characters tab → ⇅ → Import.',
      'Names of clans, attributes, skills, Disciplines, powers, rituals, merits and Predator Types can be written in English or Russian, any case.',
      'Leave out what you do not need. Skills with 0 dots can be omitted. "merits": flaw true for flaws; "note" for repeatable ones (Allies, Contacts).',
      'age: Childer, Neonate, Ancilla, Elder, Methuselah. generation: 4–16. blood_potency: 0–10. icon: an emoji for the map token. max_dots: 5 (official) – 10.',
      'Several characters in one file: {"characters": [ {...}, {...} ]}.']
    :['Шаблон персонажа RPAssistant (Vampire: The Masquerade V5). Заполните поля и импортируйте файл во вкладке «Персонажи» → ⇅ → «Импорт».',
      'Названия кланов, атрибутов, навыков, дисциплин, сил, ритуалов, достоинств и стилей охоты можно писать по-русски или по-английски, регистр не важен.',
      'Ненужное можно удалить. Навыки с 0 точек можно не писать. В «merits»: flaw: true — недостаток; note — уточнение для повторяемых (Союзники, Контакты).',
      'age: Птенцы, Неонаты, Анциллы, Старейшины, Мафусаилы. generation: 4–16. blood_potency: 0–10. icon: эмодзи для фишки на карте. max_dots: 5 (официально) – 10.',
      'Несколько персонажей в одном файле: {"characters": [ {...}, {...} ]}.'];
  download(en?'character-template.json':'шаблон-персонажа.json',JSON.stringify({_help:help,format:'rpassistant-character',version:1,system:'vtm5',...ex},null,2));
}
function importChars(pid,isM,done){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.multiple=true;
  inp.onchange=async()=>{const objs=[],bad=[];
    for(const f of inp.files){try{const j=JSON.parse(await f.text());const list=Array.isArray(j)?j:Array.isArray(j.characters)?j.characters:[j];list.forEach(x=>objs.push(x))}catch(_){bad.push(f.name)}}
    if(bad.length)toast('Не удалось прочитать: '+bad.join(', '),'err');if(!objs.length)return;
    const made=[],warns=[];
    for(const o of objs){if(!o||typeof o!=='object')continue;const w=[];const data=jsonToChar(o,w);
      const c=await App.chars.create(data,{owner:isM?null:App.user.id,npc:false});if(c){made.push(c);if(w.length)warns.push([c.name,w])}}
    if(!made.length)return;
    if(warns.length){const {el,close}=openModal(`<h3>Импортировано: ${made.length}</h3><p class="muted" style="font-size:13px">Часть названий не распознана — проверьте эти места в листе:</p>
      <div class="imp-w">${warns.map(([n,w])=>`<div><b>${esc(n)}</b><ul>${w.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div><div class="modal-actions"><button class="btn primary" data-close>Понятно</button></div>`);
      el.querySelector('[data-close]').onclick=close}
    else toast(made.length===1?`Персонаж «${made[0].name}» импортирован`:`Импортировано персонажей: ${made.length}`);
    done?.(made[0]);
  };
  inp.click();
}
function charIOMenu(btn,pid,isM,cur,done){
  document.querySelector('.cio-pop')?.remove();const S=App.chars;
  const mine=isM?S.list:S.mine();const c=cur&&S.get(cur);
  const pop=document.createElement('div');pop.className='cio-pop';
  pop.innerHTML=`${c&&(isM||c.owner_id===App.user.id)?`<button data-e1>⬇ Экспорт: ${esc(c.name)}</button>`:''}${mine.length>1?`<button data-ea>⬇ Экспорт всех (${mine.length})</button>`:''}
    <button data-i>⬆ Импорт из файла…</button><div class="cio-sep"></div><button data-t>📄 Скачать шаблон</button>`;
  document.body.appendChild(pop);const r=btn.getBoundingClientRect();pop.style.left=Math.min(r.left,innerWidth-260)+'px';pop.style.top=(r.bottom+6)+'px';
  pop.onclick=e=>{const b=e.target.closest('button');if(!b)return;pop.remove();
    if(b.dataset.e1!==undefined)exportChars([c]);if(b.dataset.ea!==undefined)exportChars(mine);if(b.dataset.i!==undefined)importChars(pid,isM,done);if(b.dataset.t!==undefined)charTemplate()};
  setTimeout(()=>document.addEventListener('pointerdown',function h(e){if(!pop.contains(e.target)){pop.remove();document.removeEventListener('pointerdown',h)}}),0);
}

/* ---------- Alt + наведение на значок персонажа — крупный просмотр ---------- */
(()=>{
  const SEL='.tk-c,.cli-av,.sh-avi,.lk-tok,.lk-img';
  let box=null,lastX=0,lastY=0,cur=null;
  const hide=()=>{if(box){box.remove();box=null}cur=null};
  const nameOf=el=>{const tok=el.closest('.tok');if(tok)return tok.querySelector('.tk-n')?.textContent||'';const cli=el.closest('.cli');if(cli)return cli.querySelector('.cli-b b')?.textContent||'';const sh=el.closest('.sheet');if(sh)return sh.querySelector('.nm')?.value||'';return ''};
  const show=el=>{
    if(cur===el&&box){place();return}
    hide();cur=el;
    const bg=getComputedStyle(el).backgroundImage,m=bg&&bg.match(/url\(["']?(.*?)["']?\)/),url=m?m[1]:null;
    const tc=getComputedStyle(el).getPropertyValue('--tc')||getComputedStyle(el).backgroundColor;
    const txt=url?'':(el.textContent||'').trim();
    box=document.createElement('div');box.className='bigav';
    box.innerHTML=`${url?`<img class="bigav-img" src="${esc(url)}" alt="">`:`<div class="bigav-i" style="background:${tc||'#3a2230'}"><span>${esc(txt)}</span></div>`}${nameOf(el)?`<div class="bigav-n">${esc(nameOf(el).replace(/^🙈\s*/,''))}</div>`:''}`;
    document.body.appendChild(box);place();box.querySelector('img')?.addEventListener('load',place);
  };
  const place=()=>{if(!box)return;const w=box.offsetWidth,h=box.offsetHeight;let x=lastX+24,y=lastY-h/2;if(x+w>innerWidth-8)x=lastX-w-24;y=Math.max(8,Math.min(innerHeight-h-8,y));box.style.left=x+'px';box.style.top=y+'px'};
  const check=alt=>{if(!alt)return hide();const el=document.elementFromPoint(lastX,lastY);const av=el&&el.closest(SEL);if(av)show(av);else hide()};
  addEventListener('mousemove',e=>{lastX=e.clientX;lastY=e.clientY;if(e.altKey)check(true);else if(box)hide()},{passive:true});
  addEventListener('keydown',e=>{if(e.key==='Alt'){check(true);if(box)e.preventDefault()}});
  addEventListener('keyup',e=>{if(e.key==='Alt'){if(box)e.preventDefault();hide()}});
  addEventListener('blur',hide);addEventListener('wheel',()=>{if(box)hide()},{passive:true});
})();
