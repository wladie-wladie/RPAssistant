/* RPAssistant — вкладка «Правила»: книги правил из PDF (текст извлекается в браузере и хранится закрыто в проекте),
   оглавление по главам, поиск по всем книгам, встроенная шпаргалка V5 */

const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjsP=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(!pdfjsP)pdfjsP=new Promise((res,rej)=>{const s=document.createElement('script');s.src=PDFJS+'pdf.min.js';s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';res(pdfjsLib)};s.onerror=()=>{pdfjsP=null;rej(new Error('Не удалось загрузить модуль чтения PDF'))};document.head.appendChild(s)});
  return pdfjsP;
}

/* разбор PDF: текст страниц + оглавление (закладки PDF или заголовки по размеру шрифта) */
async function parsePdf(file,onProgress){
  const lib=await loadPdfJs();
  const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;
  const pages=[],heads=[];const sizes=new Map();
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);const tc=await pg.getTextContent();
    let lines=[],line='',lineSize=0,lastY=null;
    for(const it of tc.items){
      if(!('str' in it))continue;const y=it.transform[5],sz=Math.round(Math.hypot(it.transform[2],it.transform[3]));
      if(lastY!==null&&Math.abs(y-lastY)>2&&line.trim()){lines.push([line,lineSize]);line='';lineSize=0}
      line+=it.str;if(it.str.trim()){lineSize=Math.max(lineSize,sz);sizes.set(sz,(sizes.get(sz)||0)+it.str.length)}
      lastY=y;if(it.hasEOL){if(line.trim())lines.push([line,lineSize]);line='';lineSize=0;lastY=null}
    }
    if(line.trim())lines.push([line,lineSize]);
    pages.push(lines.map(l=>l[0].replace(/\s+/g,' ').trim()).join('\n'));
    lines.forEach(([t,s])=>{t=t.replace(/\s+/g,' ').trim();if(t.length>2&&t.length<70&&/[A-Za-zА-Яа-яЁё]/.test(t))heads.push({t,s,p:i-1})});
    pg.cleanup();if(i%5===0||i===pdf.numPages)onProgress?.(i,pdf.numPages);
  }
  let toc=[];
  try{
    const ol=await pdf.getOutline();
    const walk=async(items,lvl)=>{for(const o of items||[]){let p=null;try{let dest=typeof o.dest==='string'?await pdf.getDestination(o.dest):o.dest;if(dest&&dest[0])p=await pdf.getPageIndex(dest[0])}catch(_){}
      if(p!==null&&o.title)toc.push({t:o.title.replace(/\s*\(\d+\)$/,'').trim(),l:lvl,p});await walk(o.items,lvl+1)}};
    await walk(ol,0);
  }catch(_){}
  if(toc.length<8){ // нет закладок — ищем заголовки по крупному шрифту
    const body=[...sizes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||10;
    const big=[...new Set(heads.filter(h=>h.s>=body*1.3).map(h=>h.s))].sort((a,b)=>b-a);
    const lv=s=>Math.min(2,big.indexOf(s));
    toc=[];let last='',prev=null;
    for(const h of heads){if(h.s<body*1.3){prev=null;continue}
      if(/\s\d{1,3}$/.test(h.t)&&h.s<big[0]){prev=null;continue} // строка оглавления «Раздел 12»
      if(prev&&prev.p===h.p&&prev.s===h.s&&prev.t.length+h.t.length<90){prev.t+=' '+h.t;continue} // заголовок в несколько строк
      if(h.t===last)continue;last=h.t;prev={t:h.t,l:lv(h.s),p:h.p,s:h.s};toc.push(prev)}
    toc=toc.filter(x=>x.t.replace(/[^A-Za-zА-Яа-яЁё]/g,'').length>=4).map(({s,...x})=>x);
    // слишком мелкие уровни отбрасываем, если заголовков очень много
    if(toc.length>400)toc=toc.filter(x=>x.l<2);
  }
  toc.sort((a,b)=>a.p-b.p);
  return {pages,toc,n:pdf.numPages};
}

/* склейка строк PDF в абзацы */
const RUNHEAD=/^(?:(?:[A-ZА-ЯЁ] ){2,}[A-ZА-ЯЁ]?(?: ?\d)*|COREBOOK(?: \d+)?|\d{1,3})\s*$/;
function cleanPage(t){return t.split('\n').filter(l=>!RUNHEAD.test(l.trim())).join('\n')}
function reflow(t){
  return cleanPage(t).replace(/-\n(?=[a-zа-яё])/g,'').split(/\n/).reduce((acc,l)=>{
    const prev=acc.length?acc[acc.length-1]:'';
    if(!prev){acc.push(l);return acc}
    const endSent=/[.!?:»"”)]$/.test(prev),short=l.length<40,bullet=/^(■|•|◻|–|-)\s?/.test(l);
    if(bullet||(endSent&&/^[A-ZА-ЯЁ"«“]/.test(l)&&prev.length<95)||(short&&/^[A-ZА-ЯЁ]/.test(l)&&endSent))acc.push(l);else acc[acc.length-1]=prev+' '+l;
    return acc},[]).join('\n');
}

/* встроенная шпаргалка V5 (своими словами) */
const V5_CHEAT={id:'cheat',title:'Шпаргалка V5',builtin:true,toc:[],pages:[]};
(()=>{
  const S=[
    ['Броски и успехи',0,`Пул кубов = Атрибут + Навык (или Дисциплина). Бросаются десятигранники.
Каждый куб с 6–10 — успех. Если успехов не меньше Сложности — победа; излишек — разница (margin).
Сложность обычно 2–4: 1 — простое дело, 3 — серьёзное, 5+ — почти невозможное.
Половина пула: если провал не грозит, мастер может засчитать автоматически половину пула успехов (округление вниз).
Пул никогда не меньше 1 куба.`],
    ['Кубы Голода',0,`Сколько у вампира Голода (0–5), столько обычных кубов в пуле заменяется кубами Голода (красные).
Кубы Голода нельзя перебрасывать за Силу воли.
Если Голод больше пула — все кубы становятся кубами Голода.`],
    ['Триумф, Кровавый триумф, Кровавый провал',0,`Каждая пара десяток даёт 4 успеха вместо 2 — это Триумф (критический успех).
Если в паре десяток есть десятка на кубе Голода — Кровавый триумф: цель достигнута, но Зверь действует жестоко и безрассудно; может вызвать Побуждение (по поправке Companion).
Если бросок провален и на кубе Голода выпала единица — Кровавый провал: Зверь вырывается, провал с тяжёлыми последствиями или Побуждение.`],
    ['Проверка пробуждения (Rouse)',0,`Бросок одного d10 без пула. 6+ — ничего не происходит, 1–5 — Голод растёт на 1.
Требуется для: пробуждения ночью, Прилива крови, большинства сил дисциплин, лечения урона, Румянца жизни.
При Голоде 5 проверку сделать нельзя — вампир рискует безумием голода.
Сила крови позволяет перебросить проверку для сил низкого уровня (см. таблицу Силы крови).`],
    ['Прилив крови',0,`Проверка пробуждения, после которой к одному броску (кроме бросков на дисциплины) добавляются кубы по Силе крови: БС0 +1, БС1–2 +2, БС3–4 +3, БС5–6 +4.`],
    ['Воля',0,`Максимум = Самообладание + Упорство.
Потратить 1 пункт (поверхностный урон Силе воли), чтобы перебросить до трёх обычных кубов (не Голода) в одном броске.
Когда вся Воля заполнена уроном — штраф −2 к социальным и ментальным броскам.`],
    ['Здоровье и урон',0,`Здоровье = Выносливость + 3. Урон бывает лёгкий (/) и тяжёлый (✕).
Для вампиров обычное оружие наносит лёгкий урон, который делится пополам (округление вверх). Огонь, солнце, клыки и когти чудовищ — тяжёлый.
Когда все клетки заполнены, новый лёгкий урон превращает старый в тяжёлый. Все клетки заполнены — штраф −2 к физическим броскам. Все клетки тяжёлые — торпор (смертный — смерть).
Лечение: проверка пробуждения убирает лёгкий урон по Силе крови; тяжёлый урон лечится долго.`],
    ['Бой',0,`Конфликт идёт по ходам. Атака — встречный бросок: атакующий против защиты цели (обычно Ловкость + Атлетика, в ближнем бою можно Драку или Ближний бой).
Урон = разница успехов + модификатор оружия. При нескольких противниках защита теряет куб за каждого следующего (кроме Быстрых рефлексов).
Стрельба: Ловкость + Стрельба; ближний бой: Сила + Ближний бой; без оружия: Сила + Драка.`],
    ['Ярость (Frenzy) и Побуждения',0,`Голод, гнев или страх могут пробудить Зверя. Сопротивление Ярости — бросок Силы воли (текущей) против Сложности ситуации; Человечность добавляет кубы (каждые 3 точки — +1).
Побуждение наступает после Кровавого провала (и, по поправке Companion, Кровавого триумфа): общее (Голод, Доминирование, Безрассудство, Высокомерие) или клановое. Пока не удовлетворена — штраф −2 на действия, ей противоречащие.`],
    ['Человечность и пятна',0,`Человечность 0–10, при создании 7. Нарушение Принципа или Хроникального табу даёт Пятна (отмечаются с правого края шкалы).
В конце сессии — бросок раскаяния: столько кубов, сколько пустых клеток (минимум 1). Хотя бы один успех — Пятна стираются, иначе Человечность падает на 1.`],
    ['Кормление и Голод',0,`Охота — бросок по стилю охоты. Кормление на человеке снимает Голод; чтобы опуститься до 0, нужно убить жертву.
Кровь животных и пакетов слабее и при высокой Силе крови перестаёт утолять Голод.
Резонанс крови (Сангвиник, Холерик, Меланхолик, Флегматик) усиливает отдельные дисциплины.`],
    ['Сила крови',0,`По основной книге (с. 216), прилив и тяжесть изъяна — с поправкой Companion (+1).
БС | Прилив | Лечение | Бонус к дисциплинам | Переброс пробуждения | Изъян
0 | +1 | 1 | 0 | — | 0
1 | +2 | 1 | 0 | ур.1 | 2
2 | +2 | 2 | +1 | ур.1 | 2
3 | +3 | 2 | +1 | ур.2 | 3
4 | +3 | 3 | +2 | ур.2 | 3
5 | +4 | 3 | +2 | ур.3 | 4
6 | +4 | 3 | +3 | ур.3 | 4
7 | +5 | 3 | +3 | ур.4 | 5
8 | +5 | 4 | +4 | ур.4 | 5
9 | +6 | 4 | +4 | ур.5 | 6
10 | +6 | 5 | +5 | ур.5 | 6
Поколение ограничивает Силу крови: 4-е 5–10, 5-е 4–9, 6-е 3–8, 7-е 3–7, 8-е 2–6, 9-е 2–5, 10–11-е 1–4, 12–13-е 1–3, 14–16-е 0.
Бонус к дисциплинам добавляется ко всем броскам с дисциплиной.`],
    ['Создание персонажа',0,`1. Концепция, клан, сир.
2. Атрибуты: 4, 3, 3, 3, 2, 2, 2, 2, 1. Здоровье = Выносливость + 3, Воля = Самообладание + Упорство.
3. Навыки: Мастер на все руки (3, 2×8, 1×10), Сбалансированный (3×3, 2×5, 1×7) или Специалист (4, 3×3, 2×3, 1×3). Бесплатные специализации для Гуманитарных наук, Ремесла, Исполнения, Естественных наук + одна любая.
4. Дисциплины: две клановые — на 2 и на 1. Каитифф — любые две.
5. Стиль охоты: специализация, точка дисциплины, достоинства и недостатки.
6. Достоинства: 7 точек, недостатки: 2 точки.
7. Принципы (1–3) и опоры. Человечность 7.
8. Море времени: птенцы, неонаты (+15 опыта), анциллы (+35 опыта, +2 достоинства, +2 недостатка, −1 Человечность).`],
    ['Опыт',0,`Атрибут: новый уровень × 5. Навык: новый уровень × 3. Специализация: 3.
Клановая дисциплина: новый уровень × 5, другая — × 7, Каитифф — × 6.
Ритуал или формула: уровень × 3. Достоинство: 3 за точку. Сила крови: новый уровень × 10.`],
  ];
  S.forEach(([t,l,txt],i)=>{V5_CHEAT.toc.push({t,l,p:i});V5_CHEAT.pages.push(txt)});
})();

/* русско-английские синонимы, чтобы искать по английской книге русскими словами */
const RU_EN={'ясновидени':'auspex','сокрыти':'obfuscate','величи':'presence','метаморфоз':'protean','кровавое чародейство':'blood sorcery','обливион':'oblivion','стиль охоты':'predator','воля':'willpower','упорств':'resolve','изъян':'bane','побуждени':'compulsion','кровавый триумф':'messy critical','кровавый провал':'bestial failure','триумф':'critical','принцип':'conviction','прихоть':'desire','наблюдательност':'awareness','уличное чуть':'streetwise','фехтовани':'melee','техник':'technology','слабокровн':'thin-blood','пробуждени':'rouse','лёгк':'superficial','легк':'superficial','ярост':'frenzy','голод':'hunger','пробуждени':'rouse','сила воли':'willpower','человечност':'humanity','пятн':'stain','кров':'blood','сила крови':'blood potency','прилив':'blood surge','безумие':'frenzy','компульси':'compulsion','криt':'critical','крит':'critical','звериный провал':'bestial failure','кровавый крит':'messy critical','дисциплин':'discipline','анимализм':'animalism','прорицани':'auspex','чары крови':'blood sorcery','стремительност':'celerity','доминировани':'dominate','стойкост':'fortitude','затемнени':'obfuscate','мощь':'potence','присутстви':'presence','превращени':'protean','забвени':'oblivion','клан':'clan','проклятие':'bane','хищник':'predator','охот':'hunting','кормлени':'feeding','урон':'damage','здоровь':'health','тяжёл':'aggravated','поверхностн':'superficial','торпор':'torpor','бой':'combat','атак':'attack','защит':'defense','оружи':'weapon','сложност':'difficulty','успех':'success','маскарад':'masquerade','камарилья':'camarilla','анарх':'anarch','шабаш':'sabbat','инквизици':'inquisition','гул':'ghoul','узы':'blood bond','диаблери':'diablerie','убеждени':'conviction','опор':'touchstone','достоинств':'merit','недостат':'flaw','фон':'background','опыт':'experience','атрибут':'attribute','навык':'skill','специализаци':'specialty','поколени':'generation','слабая кровь':'thin-blood','каитифф':'caitiff','ритуал':'ritual','резонанс':'resonance','солнц':'sunlight','огонь':'fire','день':'day','сон':'sleep','стадо':'herd','убежищ':'haven','домен':'domain','принц':'prince','примоген':'primogen','шериф':'sheriff','бруха':'brujah','гангрел':'gangrel','малкавиан':'malkavian','носферату':'nosferatu','тореадор':'toreador','тремер':'tremere','вентру':'ventrue','бану хаким':'banu haqim','министерств':'ministry','ласомбра':'lasombra','геката':'hecata','равнос':'ravnos','салюбри':'salubri','цимисх':'tzimisce'};
const RU_KEYS=Object.keys(RU_EN).sort((a,b)=>b.length-a.length);
function parseQuery(q){ // → [[вариант, вариант…], …] — каждое понятие должно встретиться
  let rest=' '+q.toLowerCase().replace(/ё/g,'е').trim()+' ';const groups=[];
  for(const ru of RU_KEYS){const k=ru.replace(/ё/g,'е');const i=rest.indexOf(k);if(i>=0){const end=rest.indexOf(' ',i+k.length);const word=rest.slice(rest.lastIndexOf(' ',i)+1,end<0?undefined:end).trim();groups.push([...new Set([word,RU_EN[ru]])]);rest=rest.slice(0,rest.lastIndexOf(' ',i)+1)+' '+rest.slice(end<0?rest.length:end)}}
  rest.split(/\s+/).filter(w=>w.length>=2).forEach(w=>groups.push([w]));
  return groups;
}
function expandQuery(q){return parseQuery(q).flat()}

/* ---------- данные книг проекта ---------- */
const RulesCache=new Map();
async function loadBook(rb){
  if(RulesCache.has(rb.id))return RulesCache.get(rb.id);
  let json=null;
  try{const c=await caches.open('rpa-rules');const hit=await c.match('/rules/'+rb.path);if(hit)json=await hit.json()}catch(_){}
  if(!json){const {data,error}=await sb.storage.from('rulebooks').download(rb.path);if(error)throw error;const txt=await data.text();json=JSON.parse(txt);try{const c=await caches.open('rpa-rules');await c.put('/rules/'+rb.path,new Response(txt,{headers:{'content-type':'application/json'}}))}catch(_){}}
  const book={...rb,...json,id:rb.id,title:rb.title};RulesCache.set(rb.id,book);return book;
}
function sectionsOf(b){ // секции с диапазоном страниц
  const t=b.toc.length?b.toc:[{t:b.title,l:0,p:0}];
  return t.map((s,i)=>{const nx=t[i+1];let end=b.builtin?s.p:nx?Math.max(s.p,Math.min(nx.p,s.p+40)):Math.min(b.pages.length-1,s.p+40);return {...s,i,end}});
}
const cap=t=>t?t[0].toUpperCase()+t.slice(1):t;
function crumbs(secs,i){const out=[];let lvl=secs[i].l;for(let j=i-1;j>=0&&lvl>0;j--)if(secs[j].l<lvl){out.unshift(secs[j].t);lvl=secs[j].l}return out}

/* ---------- вкладка ---------- */
async function renderRulesTab(main,pid,isM){
  main.innerHTML=`<div class="rules"><aside class="rl"><div class="rl-s"><input type="search" placeholder="Поиск по правилам… (можно по-русски)" data-q><div class="rl-books"></div></div><div class="rl-toc"></div></aside><section class="rv"><div class="soon"><div class="panel"><div class="ic">📖</div><h2>Правила</h2><p class="muted">Выберите раздел слева или воспользуйтесь поиском.</p></div></div></section></div>`;
  const tocEl=$('.rl-toc',main),booksEl=$('.rl-books',main),rv=$('.rv',main),qEl=$('[data-q]',main);
  let rbs=[],books=[V5_CHEAT],active=LS.get('rpa_rbook_'+pid)||'cheat',open=new Set();
  const loadList=async()=>{const {data}=await sb.from('rulebooks').select('*').eq('project_id',pid).order('sort').order('created_at');rbs=data||[];
    books=[V5_CHEAT];drawBooks();for(const rb of rbs){try{books.push(await loadBook(rb));drawBooks();if(active===rb.id)drawToc()}catch(e){console.error(e);toast(`Не удалось загрузить «${rb.title}»`,'err')}}
    if(!books.some(b=>b.id===active))active='cheat';drawBooks();drawToc()};
  const drawBooks=()=>{booksEl.innerHTML=books.map(b=>`<button class="rb ${b.id===active?'on':''}" data-b="${b.id}">${b.builtin?'⚡':'📕'} ${esc(b.title)}${b.n?`<small>${b.n} стр.</small>`:''}</button>`).join('')+rbs.filter(r=>!books.some(b=>b.id===r.id)).map(r=>`<span class="rb ld">⏳ ${esc(r.title)}</span>`).join('')+(isM?`<button class="rb add" data-up>+ Загрузить PDF</button>`:'')};
  const drawToc=()=>{const b=books.find(x=>x.id===active);if(!b){tocEl.innerHTML='';return}const secs=sectionsOf(b);
    let h='',hide=-1;secs.forEach((s,i)=>{if(hide>=0&&s.l>hide)return;hide=-1;const kids=secs[i+1]&&secs[i+1].l>s.l;const op=open.has(b.id+':'+i)||b.builtin;if(kids&&!op)hide=s.l;
      h+=`<div class="tc l${Math.min(3,s.l)}" data-s="${i}">${kids?`<i data-tg="${i}">${op?'▾':'▸'}</i>`:'<i></i>'}<span>${esc(cap(s.t))}</span>${b.builtin?'':`<small>${s.p+1}</small>`}</div>`});
    tocEl.innerHTML=(isM&&!b.builtin?`<div class="rl-bact"><button class="btn ghost sm" data-ren>Переименовать</button><button class="btn ghost sm" data-delb>Удалить книгу</button></div>`:'')+h};
  const showSection=(b,i,hl)=>{const secs=sectionsOf(b),s=secs[i];const path=crumbs(secs,i);
    const ps=[];for(let p=s.p;p<=s.end&&p<b.pages.length;p++)ps.push([p,b.pages[p]]);
    let html=ps.map(([p,t])=>`${b.builtin?'':`<div class="pgm">стр. ${p+1}</div>`}${reflow(t).split('\n').filter(x=>x.trim()).map(par=>`<p>${hilite(esc(par),hl)}</p>`).join('')}`).join('');
    rv.innerHTML=`<article class="rtext"><div class="rcr">${esc(b.title)}${path.map(x=>' › '+esc(x)).join('')}</div><h1>${esc(cap(s.t))}</h1>${html}<div class="rnav">${i>0?`<button class="btn sm" data-nav="${i-1}">← ${esc(secs[i-1].t)}</button>`:'<span></span>'}${i<secs.length-1?`<button class="btn sm" data-nav="${i+1}">${esc(secs[i+1].t)} →</button>`:''}</div></article>`;
    rv.scrollTop=0;const m=rv.querySelector('mark');if(m)m.scrollIntoView({block:'center'});
    rv.querySelectorAll('[data-nav]').forEach(x=>x.onclick=()=>showSection(b,+x.dataset.nav));
    tocEl.querySelectorAll('.tc').forEach(x=>x.classList.toggle('on',+x.dataset.s===i&&active===b.id));
  };
  const hilite=(h,terms)=>{if(!terms||!terms.length)return h;const re=new RegExp('('+terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');return h.replace(re,'<mark>$1</mark>')};
  const search=q=>{const groups=parseQuery(q),terms=groups.flat();if(!q.trim()||!groups.length){drawToc();return}
    const res=[];for(const b of books){const secs=sectionsOf(b);for(const s of secs){let got=null;for(let p=s.p;p<=s.end&&p<b.pages.length;p++){const raw=cleanPage(b.pages[p]).replace(/\n/g,' '),low=raw.toLowerCase().replace(/ё/g,'е');
        if(!groups.every(g=>g.some(t=>low.includes(t))))continue;
        let best=-1;for(const g of groups)for(const t of g){const k=low.indexOf(t);if(k>=0&&(best<0||t.includes(' ')||k<best))best=k}
        const hits=terms.reduce((n,t)=>n+(low.split(t).length-1)*(t.includes(' ')?4:1),0);const tl=s.t.toLowerCase();const score=hits+(terms.some(t=>tl.includes(t))?60:0)+(b.builtin?30:0);
        const a=Math.max(0,best-70);got={b,s,p,score,snip:(a?'…':'')+raw.slice(a,best+140)+'…'};break}
      if(got)res.push(got)}}
    res.sort((x,y)=>y.score-x.score);{const seen=new Set();const keep=[];for(const r of res){const k=r.b.id+':'+r.p;if(!seen.has(k)){seen.add(k);keep.push(r)}}res.length=0;res.push(...keep)}
    tocEl.innerHTML=`<div class="rs-h">Найдено разделов: ${res.length}${terms.length>1?` <small>(ищу: ${terms.map(esc).join(', ')})</small>`:''}</div>`+res.slice(0,120).map((r,k)=>`<div class="rs" data-r="${k}"><div class="rs-t">${r.b.builtin?'⚡':'📕'} ${esc(r.s.t)}${r.b.builtin?'':` <small>стр. ${r.p+1}</small>`}</div><div class="rs-c">${esc([r.b.title,...crumbs(sectionsOf(r.b),r.s.i)].join(' › '))}</div><div class="rs-s">${hilite(esc(r.snip),terms)}</div></div>`).join('');
    tocEl.querySelectorAll('[data-r]').forEach(x=>x.onclick=()=>{const r=res[+x.dataset.r];showSection(r.b,r.s.i,terms)});
  };
  let qt;qEl.oninput=()=>{clearTimeout(qt);qt=setTimeout(()=>search(qEl.value),220)};
  booksEl.onclick=e=>{const b=e.target.closest('[data-b]');if(b){active=b.dataset.b;LS.set('rpa_rbook_'+pid,active);qEl.value='';drawBooks();drawToc();const bk=books.find(x=>x.id===active);if(bk)showSection(bk,0);return}
    if(e.target.closest('[data-up]'))uploadBook(pid,rbs.length,()=>loadList())};
  tocEl.onclick=async e=>{const b=books.find(x=>x.id===active);
    const tg=e.target.closest('[data-tg]');if(tg){const k=active+':'+tg.dataset.tg;open.has(k)?open.delete(k):open.add(k);drawToc();return}
    if(e.target.closest('[data-delb]')){if(await confirmBox(`Удалить книгу «${b.title}» из проекта?`)){const rb=rbs.find(r=>r.id===b.id);await sb.storage.from('rulebooks').remove([rb.path]);const {error}=await sb.from('rulebooks').delete().eq('id',b.id);if(!fail(error)){RulesCache.delete(b.id);active='cheat';loadList()}}return}
    if(e.target.closest('[data-ren]')){const t=prompt('Название книги',b.title);if(t&&t.trim()){const {error}=await sb.from('rulebooks').update({title:t.trim()}).eq('id',b.id);if(!fail(error)){b.title=t.trim();drawBooks();drawToc()}}return}
    const s=e.target.closest('[data-s]');if(s&&b){const i=+s.dataset.s;const k=active+':'+i;if(!open.has(k)){open.add(k);drawToc()}showSection(b,i)}
  };
  drawBooks();drawToc();showSection(V5_CHEAT,0);if(active==='cheat')tocEl.querySelector('.tc')?.classList.add('on');
  loadList();
}

function uploadBook(pid,sort,done){
  const {el,close}=openModal(`<h3>Загрузить книгу правил</h3><p class="muted" style="font-size:13px;margin-top:-4px">Выберите PDF. Текст извлекается прямо в браузере и сохраняется только в этом проекте — его увидят мастера и игроки этой игры. Сам PDF никуда не загружается.</p>
    <form><label class="f">Файл PDF<input type="file" name="f" accept="application/pdf,.pdf" required></label><label class="f">Название<input name="t" maxlength="80" placeholder="Например: Vampire: The Masquerade V5 — рулбук"></label>
    <div class="up-prog" hidden><div class="up-bar"><i></i></div><span></span></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Отмена</button><button class="btn primary">Обработать и сохранить</button></div></form>`);
  const f=el.querySelector('form');
  f.f.onchange=()=>{if(!f.t.value&&f.f.files[0])f.t.value=f.f.files[0].name.replace(/\.pdf$/i,'').replace(/[_]+/g,' ').trim()};
  f.onsubmit=async e=>{e.preventDefault();const file=f.f.files[0];if(!file)return;const btn=f.querySelector('.btn.primary');btn.disabled=true;
    const pr=el.querySelector('.up-prog'),bar=pr.querySelector('i'),lbl=pr.querySelector('span');pr.hidden=false;
    try{
      lbl.textContent='Открываю PDF…';
      const res=await parsePdf(file,(i,n)=>{bar.style.width=(i/n*90)+'%';lbl.textContent=`Читаю страницы: ${i} из ${n}`});
      if(!res.pages.some(p=>p.trim().length>50))throw new Error('В PDF нет текстового слоя (похоже на скан) — поиск по нему невозможен');
      lbl.textContent='Сохраняю…';bar.style.width='95%';
      const id=crypto.randomUUID?crypto.randomUUID():uid(),path=`${pid}/${id}.json`;
      const blob=new Blob([JSON.stringify({pages:res.pages,toc:res.toc,n:res.n})],{type:'application/json'});
      const up=await sb.storage.from('rulebooks').upload(path,blob,{contentType:'application/json',upsert:true});if(up.error)throw up.error;
      const {error}=await sb.from('rulebooks').insert({id,project_id:pid,title:f.t.value.trim()||file.name,path,pages:res.n,sections:res.toc.length,sort,created_by:App.user.id});if(error)throw error;
      bar.style.width='100%';close();toast(`Книга обработана: ${res.n} стр., ${res.toc.length} разделов`);done?.();
    }catch(err){console.error(err);lbl.textContent=err.message||String(err);btn.disabled=false;toast('Не удалось обработать PDF: '+(err.message||err),'err')}
  };
}
