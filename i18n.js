/* RPAssistant — переключение языка RU / EN.
   Интерфейс написан по-русски; в английском режиме переводчик подменяет надписи в DOM
   (текст, title, placeholder) по словарю i18n_en.js. Пользовательский контент
   (доска, чат, заметки, текст рулбука) не трогается. */
const I18N=(()=>{
  let L='ru';try{L=localStorage.getItem('rpa_lang')==='en'?'en':'ru'}catch(_){}
  const CYR=/[А-Яа-яЁё]/;
  const dict=new Map(),pats=[],cache=new Map();
  const norm=s=>s.replace(/\s+/g,' ').trim();
  const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  /* ключи с {} — шаблоны: «Голод {} → {}» */
  function add(obj){
    for(const [k0,v] of Object.entries(obj)){
      if(v==null||v==='')continue;const k=norm(k0);
      if(k.includes('{}')){const parts=k.split('{}');pats.push([new RegExp('^'+parts.map(reEsc).join('(.*?)')+'$','s'),v,parts.length-1]);}
      else{if(!dict.has(k))dict.set(k,v);
        const o=(k.match(/\(/g)||[]).length,c=(k.match(/\)/g)||[]).length;
        const kp=k.replace(/[.…!?:;,]+$/,'');if(kp!==k&&kp&&!dict.has(kp))dict.set(kp,v.replace(/[.…!?:;,]+$/,''));
        if(o>c&&!dict.has(k+')'))dict.set(k+')',(v.match(/\(/g)||[]).length>(v.match(/\)/g)||[]).length?v+')':v)}
    }
    cache.clear();
  }
  const SEPS=[[' · '],[' — '],['\n'],[' / '],[' | '],['; '],[' + '],[' или ',' or '],[' против ',' vs '],[' и ',' and '],[', '],[': '],[' → '],['/']];
  const one=c=>{let r=dict.get(c);if(r!=null)return r;
    for(const [re,tpl] of pats){const mm=c.match(re);if(mm){let i=1;const out=tpl.replace(/\{(\d?)\}/g,(_,d)=>tr(mm[d!==''?+d+1:i++]??''));if(out!==c)return out}}
    return null};
  function tr(s,depth=0){
    if(L!=='en'||!s||!CYR.test(s))return s;
    if(cache.has(s))return cache.get(s);
    const m=s.match(/^(\s*)([\s\S]*?)(\s*)$/);const lead=m[1],trail=m[3];
    const core=norm(m[2]);
    let r=one(core);
    if(r==null){/* отрезаем не-кириллические края: цифры, значки, эмодзи, (V), ●●● */
      const a=core.match(/^([^А-Яа-яЁё]*)([\s\S]*?)([^А-Яа-яЁё]*)$/);
      if(a&&(a[1]||a[3])){let mid=a[2],pre=a[1],post=a[3];
        // незакрытая скобка/кавычка в середине — вернуть её в mid
        const cnt=(t,c)=>t.split(c).length-1;
        for(const [o,c] of [['(',')'],['«','»']]){if(cnt(mid,o)>cnt(mid,c)){const k=post.lastIndexOf(c);if(k>=0){mid+=post.slice(0,k+1);post=post.slice(k+1)}}}
        while(cnt(mid,'(')<cnt(mid,')')&&pre.endsWith('(')){mid='('+mid;pre=pre.slice(0,-1)}
        let x=one(mid);if(x!=null)r=pre+x+post;
        else if(a[1]&&(x=one(core.slice(a[1].length)))!=null)r=a[1]+x;
        else if(a[3]&&(x=one(core.slice(0,core.length-a[3].length)))!=null)r=x+a[3]}}
    if(r==null&&depth<5){for(const [sep,to] of SEPS){if(!core.includes(sep))continue;const ps=core.split(sep);const ts=ps.map(p=>tr(p,depth+1));if(ts.some((t,i)=>t!==ps[i])){r=ts.join(to||sep);break}}}
    if(r==null){const pm=core.match(/^(.+?) \((.+)\)$/);if(pm){const x=tr(pm[1],depth+1),y=tr(pm[2],depth+1);if(x!==pm[1]||y!==pm[2])r=x===y?x:x+' ('+y+')'}}
    const out=r!=null?lead+r+trail:s;
    if(cache.size>20000)cache.clear();cache.set(s,out);return out;
  }
  /* где не переводим: пользовательский контент */
  const SKIP='.world,.cw-t,.cw-peek div,[data-noi18n],script,style,code,pre';
  const ATTRS=['title','placeholder','aria-label','data-tip'];
  function el(e){
    for(const a of ATTRS){const v=e.getAttribute&&e.getAttribute(a);if(v&&CYR.test(v)){const t=tr(v);if(t!==v)e.setAttribute(a,t)}}
    if(e.tagName==='INPUT'&&CYR.test(e.value||'')&&e!==document.activeElement){
      if(e.readOnly||e.type==='button'||e.type==='submit'){const t=tr(e.value);if(t!==e.value)e.value=t}
      else if(e.type==='text'||!e.type){const t=dict.get(norm(e.value));if(t!=null)e.value=t}}
  }
  function walk(root){
    if(L!=='en'||!root)return;
    if(root.nodeType===3){const p=root.parentElement;if(p&&p.tagName!=='TEXTAREA'&&!p.closest(SKIP)){const v=root.nodeValue;if(CYR.test(v)){const t=tr(v);if(t!==v)root.nodeValue=t}}return}
    if(root.nodeType!==1)return;
    if(root.closest(SKIP))return;
    el(root);
    const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&n.matches(SKIP)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    let n;while((n=w.nextNode())){if(n.nodeType===3){if(n.parentElement.tagName==='TEXTAREA')continue;const v=n.nodeValue;if(CYR.test(v)){const t=tr(v);if(t!==v)n.nodeValue=t}}else el(n)}
  }
  let mo=null;
  function start(){
    document.documentElement.lang=L;document.body.classList.add('lang-'+L);
    if(L!=='en')return;
    try{api.loreInit&&api.loreInit()}catch(e){console.error(e)}
    if(CYR.test(document.title))document.title=tr(document.title);
    walk(document.body);
    mo=new MutationObserver(ms=>{for(const m of ms){
      if(m.type==='childList')m.addedNodes.forEach(walk);
      else if(m.type==='characterData')walk(m.target);
      else if(m.type==='attributes')el(m.target);
    }});
    mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  const api={
    get lang(){return L},loc:L==='en'?'en-GB':'ru',add,t:tr,
    set(l){try{localStorage.setItem('rpa_lang',l)}catch(_){}location.reload()},
    toggle(){this.set(L==='en'?'ru':'en')},
    /* кнопка-переключатель для шапки и экрана входа */
    btn(cls=''){return `<button class="langbtn ${cls}" data-lang title="${L==='en'?'Переключить на русский':'Switch to English'}" onclick="I18N.toggle()"><b class="${L==='ru'?'on':''}">RU</b><b class="${L==='en'?'on':''}">EN</b></button>`},
  };
  return api;
})();
if(I18N.lang==='en')document.write('<script src="i18n_en.js"><\/script><script src="i18n_lore_en.js"><\/script>');
