const $=s=>document.querySelector(s);
const fmt=n=>n==null||isNaN(n)?'—':Math.round(n).toLocaleString('fr-BE').replace(/\u202f/g,'\u00a0');
const pctFmt=(n,d=1)=>n==null||isNaN(n)?'—':(n*100).toLocaleString('fr-BE',{minimumFractionDigits:d,maximumFractionDigits:d})+' %';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let posts=[], demoPosts=null, current=null, db=null, tab='res';
try{tab=localStorage.getItem('li-tab')||'res';}catch(e){}
if(!['res','evo'].includes(tab))tab='res';
const all=()=>demoPosts||posts;

function isoWeek(iso){const d=new Date(iso+'T12:00:00');const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/864e5+1)/7);}
function dateFr(iso,opt={day:'numeric',month:'long',year:'numeric'}){return new Date(iso+'T12:00:00').toLocaleDateString('fr-BE',opt);}
const rate=p=>p.impressions?p.engagements/p.impressions:0;
const EVO_DEFS=[
  {key:'impressions',name:'Impressions',color:'var(--accent-4)',type:'bar',fn:p=>p.impressions,fmtFn:fmt},
  {key:'engagement',name:'Engagement',color:'var(--accent-3)',type:'line',fn:rate,fmtFn:v=>pctFmt(v)},
  {key:'views',name:'Vues du profil',color:'var(--good)',type:'line',fn:p=>p.profileViews,fmtFn:fmt}
];
let evoShow={impressions:true,engagement:true,views:true};
try{evoShow=Object.assign(evoShow,JSON.parse(localStorage.getItem('li-evo-show')||'{}'));}catch(e){}
function sorted(){return [...all()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);}
function topicFromUrl(url){const m=/\/posts\/[^_]+_(.+?)-(?:ugcPost|activity|share)-/i.exec(url||'');return m?m[1].split('-').filter(w=>w.length>2).slice(0,4).map(w=>'#'+w).join(' '):'';}
function embedUrl(u){u=String(u||'');const src=/src=["']([^"']+)["']/.exec(u);if(src)return src[1];
  const m=/(ugcPost|activity|share)(?:[-:]|%3A)(\d{16,20})/i.exec(u);if(!m)return null;
  const t=m[1].toLowerCase()==='ugcpost'?'ugcPost':m[1].toLowerCase();return `https://www.linkedin.com/embed/feed/update/urn:li:${t}:${m[2]}`;}
function cleanUrl(u){u=String(u||'').trim();const src=/src=["']([^"']+)["']/.exec(u);return src?src[1]:u;}
function tueOf(iso){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+5)%7));return d.toISOString().slice(0,10);}
function titleOf(p){const t=(typeof cal!=='undefined'&&cal[tueOf(p.date)]||{}).topic;return t&&t.trim()?t.trim():(demoPosts&&p.topic)?p.topic:'Post du '+dateFr(p.date,{day:'numeric',month:'long'});}
function niceMax(v){if(v<=0)return 1;const m=Math.pow(10,Math.floor(Math.log10(v)));const f=v/m;const s=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10;return s*m;}

/* ---------- parse LinkedIn export ---------- */
const FIELDS=[
  ['url',/^(post url|url)/],['date',/^(post date|date)/],['time',/(publish time|heure)/],
  ['impressions',/^impressions/],['reached',/(members reached|membres (touch|attei))/],
  ['profileViews',/(profile view|profil)/],['followers',/(followers|abonn)/],
  ['engagements',/(social engagements|interactions)/],['reactions',/^r[ée]actions/],
  ['comments',/^comment/],['reposts',/(repost|republication|partage)/],['saves',/^(saves|enregistr)/],
  ['sends',/(sends|envois)/],['links',/(link engagement|lien)/]
];
const CAT={'job title':'Poste','location':'Localisation','seniority':'Séniorité','company':'Entreprise','industry':'Secteur','company size':'Taille d\'entreprise'};
function toNum(v){if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/[\s .,](?=\d{3}\b)/g,'').replace(',','.'));return isNaN(n)?0:n;}
function toPct(v){v=String(v||'').trim();if(v.startsWith('<'))return .5;return parseFloat(v.replace(',','.'))||0;}
function toIso(v){
  if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10);}
  const s=String(v).trim();let m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
  if(m){let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;let mo=a,da=b;if(a>12){da=a;mo=b;}return `${y}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`;}
  m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(m)return m[0];
  const d=new Date(s);return isNaN(d)?null:d.toISOString().slice(0,10);
}
function parseRows(rows){
  const raw={};const demo={};let inDemo=false;
  for(const r of rows){
    const a=String(r[0]??'').trim(),b=r[1],c=r[2];if(!a)continue;
    const al=a.toLowerCase();
    if(/demographic|démograph/.test(al)){inDemo=true;continue;}
    if(inDemo){if(/^(category|catégorie)$/.test(al))continue;const k=CAT[al]||a;(demo[k]=demo[k]||[]).push([String(b??''),toPct(c)]);continue;}
    if(b==null||String(b).trim()==='')continue;
    for(const [k,re] of FIELDS){if(raw[k]===undefined&&re.test(al)){raw[k]=b;break;}}
  }
  if(!raw.url&&!raw.date)throw new Error("format non reconnu");
  const url=String(raw.url||'');const idm=url.match(/(\d{16,20})/g);
  const date=toIso(raw.date);
  const p={id:idm?idm[idm.length-1]:(date||Date.now().toString()),url,date,time:String(raw.time||''),demographics:demo};
  for(const k of ['impressions','reached','profileViews','followers','engagements','reactions','comments','reposts','saves','sends','links'])p[k]=toNum(raw[k]);
  if(!p.engagements)p.engagements=p.reactions+p.comments+p.reposts;
  return p;
}
async function importFiles(files){
  demoPosts=null;$('#demo').hidden=true;
  const st=$('#status');st.hidden=false;st.className='status edit-only';let ok=0;
  for(const f of files){
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:null});
      const p=parseRows(rows);
      if(pendingRow){p.origDate=p.date;p.date=pendingRow;}
      const old=posts.find(x=>x.id===p.id);
      if(old){p.notes=old.notes;p.next=old.next;}
      p.importedAt=new Date().toISOString();
      await save(p);ok++;current=p.id;
    }catch(e){st.className='status edit-only err';st.textContent=`« ${f.name} » n'a pas pu être lu (${e.message}). Utilise l'export des statistiques du post LinkedIn en .xlsx.`;}
  }
  pendingRow=null;
  if(ok){st.textContent=`${ok} post${ok>1?'s':''} importé${ok>1?'s':''}.`;render();}
}
async function save(p){
  if(demoPosts)return;
  const i=posts.findIndex(x=>x.id===p.id);if(i>=0)posts[i]=p;else posts.push(p);
  try{localStorage.setItem('li-dash-cache',JSON.stringify(posts));}catch(e){}
  if(db){try{await db.doc('posts/'+p.id).set(p);}catch(e){}}
}



function makeDemo(){
  const base=posts[0]?.demographics||{};
  const series=[[820,470,31,6],[1040,610,44,9],[760,430,26,4],[1320,720,58,12],[1180,650,49,11],[1556,853,71,20]];
  const end=new Date('2026-09-22T12:00:00');
  return series.map((s,i)=>{const d=new Date(end);d.setDate(d.getDate()-7*(series.length-1-i));const r=Math.round(s[2]*.72),c=Math.round(s[2]*.24);
    return {id:'demo'+i,date:d.toISOString().slice(0,10),time:'8:15 AM',url:'',topic:['Retour sur ma formation','Mon projet SEA','Les 3 KPI que je suis','Case study','Ce que j\'apprends en agence','Nouveau job'][i],
      impressions:s[0],reached:s[1],engagements:s[2],reactions:r,comments:c,reposts:s[2]-r-c,saves:0,sends:0,links:0,profileViews:s[3],followers:0,demographics:base};});
}

function delta(cur,prev,isRate){
  if(prev==null)return '<span class="delta flat">1re semaine</span>';
  if(isRate){const d=(cur-prev)*100;const c=Math.abs(d)<.05?'flat':d>0?'up':'down';return `<span class="delta ${c}">${d>0?'▲ +':d<0?'▼ −':'= '}${Math.abs(d).toLocaleString('fr-BE',{maximumFractionDigits:1})} pt</span>`;}
  if(!prev)return cur?'<span class="delta up">▲ nouveau</span>':'<span class="delta flat">=</span>';
  const d=(cur-prev)/prev;const c=Math.abs(d)<.005?'flat':d>0?'up':'down';
  return `<span class="delta ${c}">${d>0?'▲ +':d<0?'▼ −':'= '}${Math.abs(Math.round(d*100))} %</span>`;
}

function trendChart(series,labels,curIdx){
  const W=1000,H=380,pl=58,pr=58,pt=24,pb=42,n=labels.length;
  const x=i=>n===1?W/2:pl+(W-pl-pr)*i/(n-1);
  const y=v=>H-pb-(H-pt-pb)*v;
  const bar=series.find(s=>s.type==='bar'), line=series.find(s=>s.type!=='bar');
  const leftS=bar||series[0], rightS=series.find(s=>s!==leftS);
  const norm=series.map(s=>{const max=niceMax(Math.max(...s.values,0,1)*1.08);return{max,vals:s.values.map(v=>(v||0)/max)};});
  let g='';
  [0,.25,.5,.75,1].forEach(f=>{const yy=y(f);
    g+=`<line x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}" stroke="var(--line)" ${f?'stroke-dasharray="3 5"':''}/>`;
    if(leftS){const li=series.indexOf(leftS);g+=`<text x="${pl-10}" y="${yy+4}" text-anchor="end" font-size="12.5" fill="var(--ink-3)" font-family="Montserrat,sans-serif">${leftS.fmtFn(norm[li].max*f)}</text>`;}
    if(rightS){const ri=series.indexOf(rightS);g+=`<text x="${W-pr+10}" y="${yy+4}" text-anchor="start" font-size="12.5" fill="var(--ink-3)" font-family="Montserrat,sans-serif">${rightS.fmtFn(norm[ri].max*f)}</text>`;}});
  const spacing=n>1?(W-pl-pr)/(n-1):W-pl-pr;
  series.forEach((s,si)=>{
    const vals=norm[si].vals;
    if(s.type==='bar'){
      const bw=Math.min(34,spacing*.42);
      vals.forEach((v,i)=>{const cx=x(i),h=Math.max(2,(H-pt-pb)*v),cur=i===curIdx;
        g+=`<rect x="${cx-bw/2}" y="${H-pb-h}" width="${bw}" height="${h}" rx="5" fill="${s.color}"${cur?'':' fill-opacity=".55"'}/>`;});
      return;
    }
    if(n>1){const pts=vals.map((v,i)=>[x(i),y(v)]);let d=`M${pts[0]}`;
      for(let i=1;i<n;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2;d+=` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;}
      g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round"/>`;}
    vals.forEach((v,i)=>{const cx=x(i),cy=y(v),cur=i===curIdx;
      g+=cur?`<circle cx="${cx}" cy="${cy}" r="8" fill="${s.color}" fill-opacity=".18"/><circle cx="${cx}" cy="${cy}" r="5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`
        :`<circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--surface)" stroke="${s.color}" stroke-width="2"/>`;});
  });
  g+=`<line x1="${pl}" x2="${W-pr}" y1="${H-pb}" y2="${H-pb}" stroke="var(--ink-3)"/>`;
  const hw=n===1?W:spacing;
  labels.forEach((lb,i)=>{const cx=x(i);
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="13" fill="${i===curIdx?'var(--ink)':'var(--ink-3)'}" font-weight="${i===curIdx?600:400}" font-family="Cambria,Caladea,Georgia,serif">${lb}</text>`;
    const tip=series.map(s=>`${esc(s.name)} : <b>${s.fmtFn(s.values[i])}</b>`).join('<br>');
    g+=`<rect x="${cx-hw/2}" y="0" width="${hw}" height="${H}" fill="transparent" data-tip="${lb}<br>${tip}"/>`;});
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution combinée par semaine">${g}</svg>`;
}

function renderWeeks(s,p){
  $('#wsel').innerHTML=s.length?[...s].reverse().map(x=>`<option value="${x.id}" ${x.id===p?.id?'selected':''}>Semaine ${isoWeek(x.date)} · ${dateFr(x.date,{day:'numeric',month:'short'})}</option>`).join(''):'<option>Aucune semaine</option>';
  const i=s.findIndex(x=>x.id===p?.id);
  $('#prev').disabled=i<=0;$('#next').disabled=i<0||i>=s.length-1;
}

let view='dash', calMore=0, cal={};
try{cal=JSON.parse(localStorage.getItem('li-cal')||'{}')||{};}catch(e){}
function saveCal(){try{localStorage.setItem('li-cal',JSON.stringify(cal));}catch(e){}if(db){db.doc('cal/plan').set({items:cal}).catch(()=>{});}}
let openDraft=null, editDraft=null, pendingRow=null, calMsg='';
function countTxt(t){const n=[...t].length;return `<span class="${n>3000?'over':''}">${n.toLocaleString('fr-BE')} / 3 000 caractères</span> · environ les 210 premiers s'affichent avant « … voir plus »`;}
const STATUS=[['idee','Idée'],['redac','En rédaction'],['pret','Prêt'],['pub','Publié']];
function tuesdays(){
  const t=new Date();t.setHours(12,0,0,0);const d=new Date(t);d.setDate(d.getDate()-((d.getDay()+5)%7));/* last Tuesday */
  const out=[];for(let i=-4;i<=8+calMore;i++){const x=new Date(d);x.setDate(x.getDate()+7*i);out.push(x.toISOString().slice(0,10));}
  // include any planned dates outside range
  Object.keys(cal).forEach(k=>{if(!out.includes(k))out.push(k);});
  return out.sort();
}
function renderCal(){
  $('#head').innerHTML=`<div class="cal-h"><div><span class="eyebrow">Un post par semaine.</span><h1>Calendrier éditorial</h1><p>Un post chaque mardi · bilan le lundi suivant</p></div></div>${calMsg?`<div class="demo-banner" style="margin-top:12px">${esc(calMsg)}</div>`:''}`;calMsg='';
  $('#tabs').hidden=true;
  const today=new Date().toISOString().slice(0,10);
  const lastTue=tuesdays().filter(d=>d<=today).pop();
  const days=tuesdays().filter(d=>d>=today||d===lastTue||cal[d]||all().some(x=>isoWeek(x.date)===isoWeek(d)));const nextD=days.find(d=>d>=today);
  let html='<div class="cal">',month='';
  days.forEach(d=>{
    const m=dateFr(d,{month:'long',year:'numeric'});
    if(m!==month){html+=`<div class="cal-m">${m}</div>`;month=m;}
    const it=cal[d]||{};const wk=isoWeek(d);
    const pub=all().find(x=>isoWeek(x.date)===wk&&x.date.slice(0,4)===d.slice(0,4));
    const st=pub?'pub':(it.status||'idee');
    const topic=it.topic||'';
    html+=`<div class="cal-r ${d===nextD?'next':''} ${d<today&&!pub?'past':''}" data-d="${d}">
      <div class="cal-d"><b>${dateFr(d,{weekday:'short',day:'numeric',month:'short'})}</b><span>Semaine ${wk}</span>${d===nextD?'<em>Prochain post</em>':''}</div>
      <input class="topic" type="text" data-f="topic" value="${esc(topic)}" placeholder="Sujet du post" aria-label="Sujet du ${dateFr(d)}">
      <select class="st st-${st}" data-f="status" aria-label="Statut" ${pub?'disabled':''}>${STATUS.map(([k,n])=>`<option value="${k}" ${st===k?'selected':''}>${n}</option>`).join('')}</select>
      <button type="button" class="dbtn ${it.draft?'has':''}" data-draft="${d}" aria-expanded="${openDraft===d}">${it.draft?'Draft ✓':'+ Draft'}</button>
      <div class="cal-res">${pub?`<button type="button" data-open="${pub.id}">${fmt(pub.impressions)} impressions ›</button><br><label class="upd" for="file" data-row="${d}">Mettre à jour les stats</label>`:`<label class="ibtn" for="file" data-row="${d}">Importer le fichier Excel</label>`}</div>
    </div>`;
    if(openDraft===d){const ed=editDraft===d||!it.draft;const pen='<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
      html+=`<div class="cal-draft"><div class="dhead"><span class="muted">Draft du post du ${dateFr(d,{weekday:'long',day:'numeric',month:'long'})}</span>${ed?'':`<button type="button" class="pen" data-edit="${d}" title="Modifier le draft" aria-label="Modifier le draft">${pen}</button>`}</div>
      ${ed?`<textarea id="draft-${d}" data-dtext="${d}" aria-label="Draft" placeholder="Écris ou colle ton post ici…">${esc(it.draft||'')}</textarea>`:`<div class="dview">${esc(it.draft)}</div>`}
      <div class="dfoot"><span data-count>${countTxt(it.draft||'')}</span><span class="dbtns">${ed?`<button type="button" data-done="${d}">Terminé ✓</button>`:''}<button type="button" data-copy="${d}">Copier le texte</button></span></div></div>`;}
  });
  html+='</div><button type="button" class="more" id="calmore">Afficher 4 semaines de plus</button>';
  $('#main').innerHTML=`<div style="display:grid;gap:14px">${html}</div>`;
  $('#main').querySelectorAll('.cal-r [data-f]').forEach(el=>el.addEventListener('change',()=>{
    const d=el.closest('.cal-r').dataset.d;cal[d]=cal[d]||{};cal[d][el.dataset.f]=el.value;saveCal();
    if(el.dataset.f==='topic'){const pb=all().find(x=>isoWeek(x.date)===isoWeek(d));if(pb){pb.topic=el.value;save(pb);}}
    if(el.dataset.f==='status')el.className='st st-'+el.value;}));
  $('#calmore').addEventListener('click',()=>{calMore+=4;renderCal();});
  $('#main').querySelectorAll('[data-draft]').forEach(b=>b.addEventListener('click',()=>{openDraft=openDraft===b.dataset.draft?null:b.dataset.draft;editDraft=null;renderCal();const t=openDraft&&$('#draft-'+openDraft);if(t)t.focus();}));
  const ta=$('#main').querySelector('[data-dtext]');
  if(ta){let tm;ta.addEventListener('input',()=>{const d=ta.dataset.dtext;cal[d]=cal[d]||{};cal[d].draft=ta.value;ta.closest('.cal-draft').querySelector('[data-count]').innerHTML=countTxt(ta.value);
      const btn=$('#main').querySelector(`[data-draft="${d}"]`);btn.classList.toggle('has',!!ta.value);btn.textContent=ta.value?'Draft ✓':'+ Draft';clearTimeout(tm);tm=setTimeout(saveCal,400);});
    ta.addEventListener('blur',saveCal);}
  const pe=$('#main').querySelector('[data-edit]');if(pe)pe.addEventListener('click',()=>{editDraft=pe.dataset.edit;renderCal();const t=$('#draft-'+editDraft);if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}});
  const dn=$('#main').querySelector('[data-done]');if(dn)dn.addEventListener('click',()=>{saveCal();editDraft=null;renderCal();});
  const cp=$('#main').querySelector('[data-copy]');
  if(cp)cp.addEventListener('click',async()=>{const t=(cal[cp.dataset.copy]||{}).draft||'';try{await navigator.clipboard.writeText(t);cp.textContent='Copié ✓';}catch(e){const v=$('#main').querySelector('.dview,[data-dtext]');if(v){if(v.select)v.select();else{const r=document.createRange();r.selectNodeContents(v);const sl=getSelection();sl.removeAllRanges();sl.addRange(r);}}cp.textContent='Texte sélectionné — Ctrl+C';}setTimeout(()=>cp.textContent='Copier le texte',2000);});
}
function setView(v){view=v;$('#calbtn').setAttribute('aria-pressed',v==='cal');$('#calbtn').textContent=v==='cal'?'‹ Résultats':'Calendrier';render();}

function render(){
  if(view==='cal'){renderWeeks(sorted(),sorted().find(x=>x.id===current)||sorted().slice(-1)[0]);$('#status').hidden=true;return renderCal();}
  const s=sorted();
  const p=s.find(x=>x.id===current)||s[s.length-1];
  renderWeeks(s,p);
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',t.dataset.tab===tab));
  if(!p){
    $('#head').innerHTML='';$('#tabs').hidden=true;
    $('#main').innerHTML=`<div class="empty"><h2>Importe ton premier post</h2><p class="muted">Sur LinkedIn : ton post → Statistiques → Exporter. Puis ouvre le Calendrier et clique « Importer les stats » sur la bonne semaine.</p><p><button type="button" class="dbtn" onclick="setView('cal')">Ouvrir le calendrier</button></p></div>`;return;
  }
  $('#tabs').hidden=false;
  current=p.id;const idx=s.indexOf(p);const pr=idx>0?s[idx-1]:null;
  $('#head').innerHTML=`<div style="display:grid;gap:4px"><span class="eyebrow">Semaine ${isoWeek(p.date)} · Bilan LinkedIn.</span><h1>${esc(titleOf(p))}</h1>
    <div class="meta"><span>${p.origDate&&p.origDate!==p.date?`Post du ${dateFr(p.date,{weekday:'long',day:'numeric',month:'long'})} · publié sur LinkedIn le ${dateFr(p.origDate,{day:'numeric',month:'long',year:'numeric'})}`:`Publié le ${dateFr(p.date,{weekday:'long',day:'numeric',month:'long'})}`}</span>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">Voir le post ↗</a>`:''}</div></div>`;

  let html='';
  if(tab==='post'){
    html=`<div class="post-wrap">
      <div class="post-frame">${p.shot?`<img src="${p.shot}" alt="Capture du post LinkedIn">`:`<label class="drop edit-only" for="shot-file"><b>Ajoute une capture d'écran du post</b><span>Fais une capture du post, puis colle-la ici avec Ctrl+V — ou clique pour choisir l'image.</span></label><div class="post-empty present-only">Pas de capture pour ce post.</div>`}</div>
      <div class="post-side">
        ${p.url?`<div><a class="pbtn solid" href="${esc(cleanUrl(p.url))}" target="_blank" rel="noopener">Ouvrir le post sur LinkedIn ↗</a></div>`:''}
        <label class="edit-only" style="display:grid;gap:6px;font-size:14px;color:var(--ink-2);font-weight:500">Titre du post (affiché en haut)<input type="text" id="n-topic" value="${esc(p.topic)}"></label>
        <label class="edit-only" style="display:grid;gap:6px;font-size:14px;color:var(--ink-2);font-weight:500">Lien du post
          <div class="link-row"><input type="text" id="n-url" value="${esc(p.url)}" placeholder="https://www.linkedin.com/posts/…"><button class="pbtn" type="button" id="url-save">Enregistrer</button></div></label>
        ${p.shot?`<div class="link-row edit-only"><label class="pbtn" for="shot-file">Remplacer la capture</label><button class="pbtn" type="button" id="shot-del">Retirer</button></div>`:''}
        <input type="file" id="shot-file" accept="image/*" hidden>
      </div></div>`;
  }
  if(tab==='res'){
    const d=p.demographics||{};
    const ipm=p.reached?p.impressions/p.reached:null, i100=p.impressions?p.engagements/p.impressions*100:null;
    const n1=v=>v==null?'—':v.toLocaleString('fr-BE',{minimumFractionDigits:1,maximumFractionDigits:1});
    const plural=(n,a,b)=>`${fmt(n)} ${n>1?b:a}`;
    const aud=(t,list,tr)=>list&&list.length?`<div><h3>${t}</h3>${hbars(list.slice(0,5).map(([n,v])=>[tr(n),v]))}</div>`:'';
    const kpi=(lead,val,label,dl)=>`<div class="kpi${lead?' lead':''}"><span class="k-l">${label}</span><span class="k-v">${val}</span>${dl||''}</div>`;
    html=`<div style="display:grid;gap:26px">
      <div class="kpis">
        ${kpi(true,fmt(p.impressions),'Impressions',delta(p.impressions,pr?.impressions))}
        ${kpi(false,fmt(p.reached),'Personnes touchées',delta(p.reached,pr?.reached))}
        ${kpi(false,fmt(p.engagements),'Interactions',delta(p.engagements,pr?.engagements))}
        ${kpi(false,pctFmt(rate(p)),'Taux d\'engagement',delta(rate(p),pr?rate(pr):null,true))}
        ${kpi(false,fmt(p.profileViews),'Vues du profil',delta(p.profileViews,pr?.profileViews))}
      </div>
      <div class="grid2" style="gap:22px">
        <section class="card" style="gap:18px">
          <div><h2>Impressions, personnes touchées & interactions</h2><span class="muted">En nombre absolu, pour comparer les volumes</span></div>
          <div class="donut-wrap">
            ${donut([['Impressions',p.impressions,'var(--accent-4)'],['Personnes touchées',p.reached,'var(--accent-3)'],['Interactions',p.engagements,'var(--lime)']],p.impressions+p.reached+p.engagements)}
            <div class="legend">
              ${[['Impressions',p.impressions,'var(--accent-4)'],['Personnes touchées',p.reached,'var(--accent-3)'],['Interactions',p.engagements,'var(--lime)']].map(([n,v,c])=>`<div class="lg"><i style="background:${c}"></i><span>${n}</span><b>${fmt(v)}</b></div>`).join('')}
            </div>
          </div>
          <div class="grid2" style="gap:22px">
            <div class="gauge"><b>${n1(ipm)}</b><span>impressions par personne touchée</span></div>
            <div class="gauge"><b>${n1(i100)}</b><span>interactions pour 100 impressions</span></div>
          </div>
        </section>
        ${p.engagements?`<section class="card" style="gap:18px">
          <div><h2>Types d'interactions</h2><span class="muted">Réactions, commentaires, republications · ${fmt(p.engagements)} au total</span></div>
          <div class="donut-wrap">
            ${donut([['Réactions',p.reactions,'var(--accent-4)'],['Commentaires',p.comments,'var(--accent-3)'],['Republications',p.reposts,'var(--lime)']],p.engagements)}
            <div class="legend">
              ${[['Réactions',p.reactions,'var(--accent-4)'],['Commentaires',p.comments,'var(--accent-3)'],['Republications',p.reposts,'var(--lime)']].map(([n,v,c])=>`<div class="lg"><i style="background:${c}"></i><span>${n} · ${v?Math.round(v/p.engagements*100):0}&nbsp;%</span><b>${fmt(v)}</b></div>`).join('')}
            </div>
          </div>
        </section>`:''}
      </div>
      ${Object.keys(d).length?`<section class="card" style="gap:18px">
        <div><h2>Qui a vu le post</h2><span class="muted">Top 5 par catégorie · en % des personnes qui ont vu le post</span></div>
        <div class="aud3">${aud('Localisation',d['Localisation'],frLoc)}${aud('Niveau hiérarchique',d['Séniorité'],frSen)}${aud('Secteur',d['Secteur'],frInd)}</div>
      </section>`:''}
      <div class="source"><span>Source : LinkedIn Analytics · export${p.importedAt?' importé le '+dateFr(p.importedAt.slice(0,10),{day:'numeric',month:'numeric',year:'numeric'}):''}</span><span>S${isoWeek(p.date)}</span></div>
    </div>`;
  }
  if(tab==='evo'){
    const win=s.slice(Math.max(0,idx-7),idx+1);
    const active=EVO_DEFS.filter(d=>evoShow[d.key]);
    const series=active.map(d=>({name:d.name,color:d.color,type:d.type,values:win.map(d.fn),fmtFn:d.fmtFn}));
    html=`<div style="display:grid;gap:18px"><div class="card chart">
      <div class="card-h"><h2>Évolution par semaine</h2><div class="seg">${EVO_DEFS.map(d=>`<button type="button" data-evo="${d.key}" aria-pressed="${!!evoShow[d.key]}"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${d.color};margin-right:6px;vertical-align:middle"></i>${d.name}</button>`).join('')}</div></div>
      ${series.length?trendChart(series,win.map(x=>'S'+isoWeek(x.date)),win.length-1):`<div class="hint">Choisis au moins un élément à afficher.</div>`}
      ${s.length<2?`<div class="hint">L'évolution apparaît dès la 2e semaine.${demoPosts?'':'<button type="button" data-demo class="edit-only">Voir un exemple</button>'}</div>`:''}
    </div>
    <div class="card"><h2>Toutes les semaines</h2><div class="tw"><table>
      <thead><tr><th>Semaine</th><th>Impressions</th><th>Touchées</th><th>Engagement</th><th>Vues profil</th><th class="edit-only"></th></tr></thead>
      <tbody>${[...s].reverse().map(x=>`<tr data-id="${x.id}" class="${x.id===p.id?'cur':''}"><td>S${isoWeek(x.date)} · ${dateFr(x.date,{day:'numeric',month:'short'})}</td><td>${fmt(x.impressions)}</td><td>${fmt(x.reached)}</td><td>${pctFmt(rate(x))}</td><td>${fmt(x.profileViews)}</td><td class="edit-only">${demoPosts?'':`<button class="del" type="button" data-del="${x.id}">Supprimer</button>`}</td></tr>`).join('')}</tbody>
    </table></div></div></div>`;
  }
  $('#main').innerHTML=html;
  if(tab==='post'){$('#shot-file').addEventListener('change',e=>{if(e.target.files[0])setShot(e.target.files[0]);});const dl=$('#shot-del');if(dl)dl.addEventListener('click',async()=>{const q=all().find(x=>x.id===current);delete q.shot;await save(q);render();});}
  if(tab==='post'&&$('#url-save')){const sv=async()=>{const q=all().find(x=>x.id===current);const v=cleanUrl($('#n-url').value);if(v===q.url)return;q.url=v;await save(q);render();};$('#url-save').addEventListener('click',sv);$('#n-url').addEventListener('keydown',e=>{if(e.key==='Enter')sv();});}
  const nt=$('#n-topic');if(nt)nt.addEventListener('change',async()=>{const q=all().find(x=>x.id===current);q.topic=nt.value;await save(q);render();});
}
const LOC={'Brussels Metropolitan Area':'région bruxelloise','Greater Paris Metropolitan Region':'région parisienne','Antwerp Metropolitan Area':'région d\'Anvers','Namur Metropolitan Area':'région de Namur','Liege Metropolitan Area':'région de Liège','Ghent Metropolitan Area':'région de Gand','Louvain Metropolitan Area':'région de Louvain','Amsterdam Area':'région d\'Amsterdam','London Area, United Kingdom':'région de Londres'};
const frLoc=n=>LOC[n]||n;
const IND={'Advertising Services':'Publicité','Law Practice':'Cabinets d\'avocats','Public Relations and Communications Services':'Relations publiques & com','Financial Services':'Services financiers','Marketing Services':'Marketing','IT Services and IT Consulting':'Services IT','Business Consulting and Services':'Conseil aux entreprises','Legal Services':'Services juridiques','Staffing and Recruiting':'Recrutement','Human Resources Services':'Ressources humaines','Software Development':'Développement logiciel','Higher Education':'Enseignement supérieur','Government Administration':'Administration publique','Banking':'Banque','Insurance':'Assurance'};
const frInd=n=>IND[n]||n;
function hbars(list){const max=Math.max(...list.map(x=>x[1]),1);
  return `<div class="hb">${list.map(([n,v],i)=>`<div class="hb-row"><span class="hb-n">${esc(n)}</span><div class="hb-t"><div class="hb-f" style="width:${Math.max(3,v/max*100)}%;background:var(--accent-3)"></div></div><span class="hb-v">${v===.5?'&lt; 1':v} %</span></div>`).join('')}</div>`;}
function donut(items,total){const R=62,SW=22,C=2*Math.PI*R;let off=0,g='';const nz=items.filter(x=>x[1]>0);
  nz.forEach(([n,v,c])=>{const len=Math.max(0,C*v/total-(nz.length>1?3:0));g+=`<circle cx="80" cy="80" r="${R}" fill="none" stroke="${c}" stroke-width="${SW}" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)" data-tip="${n} · <b>${v}</b>"/>`;off+=C*v/total;});
  return `<svg viewBox="0 0 160 160" role="img" aria-label="Répartition des interactions"><circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/>${g}<text x="80" y="84" text-anchor="middle" font-size="34" font-weight="700" fill="var(--ink)" font-family="Cambria,Caladea,Georgia,serif">${fmt(total)}</text><text x="80" y="104" text-anchor="middle" font-size="11" fill="var(--ink-3)" font-family="Cambria,Caladea,Georgia,serif">au total</text></svg>`;}
const SEN={Senior:'Senior',Entry:'Junior',Manager:'Manager',Director:'Direction',Owner:'Fondateur',CXO:'Direction (CXO)',Training:'Stagiaire',VP:'VP',Partner:'Associé',Unpaid:'Bénévole'};
const frSen=n=>SEN[n]||n;

/* events */
function go(id){current=id;if(view==='cal'){setView('dash');}else render();}
$('#wsel').addEventListener('change',e=>{view='dash';setView('dash');go(e.target.value);});
document.addEventListener('click',e=>{const r=e.target.closest('[data-row]');pendingRow=r?r.dataset.row:pendingRow;},true);
$('#home').addEventListener('click',()=>{tab='res';setView('dash');window.scrollTo({top:0});});
$('#calbtn').addEventListener('click',()=>setView(view==='cal'?'dash':'cal'));
document.addEventListener('click',e=>{const o=e.target.closest('[data-open]');if(o){tab='res';current=o.dataset.open;setView('dash');}});
$('#prev').addEventListener('click',()=>{const s=sorted();const i=s.findIndex(x=>x.id===current);if(i>0)go(s[i-1].id);});
$('#next').addEventListener('click',()=>{const s=sorted();const i=s.findIndex(x=>x.id===current);if(i<s.length-1)go(s[i+1].id);});
$('#tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;try{localStorage.setItem('li-tab',tab);}catch(_){}render();}});
$('#file').addEventListener('change',e=>{if(e.target.files.length)importFiles([...e.target.files]);e.target.value='';});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();const f=[...e.dataTransfer.files];const img=f.find(x=>x.type.startsWith('image/'));if(img){setShot(img);return;}if(f.length){pendingRow=null;importFiles(f);}});
document.addEventListener('paste',e=>{if(tab!=='post'||/INPUT|TEXTAREA/.test(document.activeElement?.tagName||''))return;const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(it){e.preventDefault();setShot(it.getAsFile());}});
function setShot(file){
  const q=all().find(x=>x.id===current);if(!q)return;
  const img=new Image();const url=URL.createObjectURL(file);
  img.onload=async()=>{const k=Math.min(1,1000/img.width);const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
    q.shot=c.toDataURL('image/jpeg',.85);await save(q);
    try{localStorage.setItem('li-dash-cache',JSON.stringify(posts));}catch(err){const st=$('#status');st.hidden=false;st.className='status edit-only err';st.textContent="Mémoire du navigateur pleine : retire d'anciennes captures.";}
    tab='post';render();};
  img.src=url;
}
$('#demo-off').addEventListener('click',()=>{demoPosts=null;$('#demo').hidden=true;current=null;render();});
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-demo]')){demoPosts=makeDemo();$('#demo').hidden=false;current=null;render();return;}
  const ev=e.target.closest('[data-evo]');if(ev){evoShow[ev.dataset.evo]=!evoShow[ev.dataset.evo];try{localStorage.setItem('li-evo-show',JSON.stringify(evoShow));}catch(_){}render();return;}
  const d=e.target.closest('[data-del]');
  if(d){e.stopPropagation();
    if(d.dataset.confirm){const id=d.dataset.del;posts=posts.filter(x=>x.id!==id);try{localStorage.setItem('li-dash-cache',JSON.stringify(posts));}catch(_){}if(db){try{await db.doc('posts/'+id).delete();}catch(_){}}if(current===id)current=null;render();}
    else{d.dataset.confirm=1;d.textContent='Confirmer ?';}return;}
  const tr=e.target.closest('tr[data-id]');if(tr){tab='res';go(tr.dataset.id);}
});
$('#present').addEventListener('click',()=>{
  const on=document.body.classList.toggle('present');$('#present').textContent=on?'Quitter':'Présenter';
  try{if(on&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});else if(!on&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});}catch(_){}
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('present')){document.body.classList.remove('present');$('#present').textContent='Présenter';}});
const tip=$('#tip');
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(!t){tip.hidden=true;return;}tip.innerHTML=t.dataset.tip;tip.hidden=false;tip.style.left=Math.max(8,Math.min(e.clientX+12,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=(e.clientY-tip.offsetHeight-12)+'px';});

try{const c=JSON.parse(localStorage.getItem('li-dash-cache')||'[]');if(Array.isArray(c))posts=c;}catch(e){}
render();
(async()=>{
  try{db=await window.claude?.use?.('db');}catch(e){db=null;}
  if(!db)return;
  db.doc('cal/plan').onSnapshot(sn=>{const d=sn.data&&sn.data();if(d&&d.items){cal=d.items;try{localStorage.setItem('li-cal',JSON.stringify(cal));}catch(_){}if(view==='cal'&&!/INPUT|SELECT/.test(document.activeElement?.tagName||''))renderCal();}},()=>{});
  db.collection('posts').onSnapshot(snap=>{
    posts=snap.docs.map(d=>d.data()).filter(Boolean).map(d=>JSON.parse(JSON.stringify(d)));
    const f=document.activeElement&&/n-/.test(document.activeElement.id||'');
    if(!f&&!demoPosts)render();
  },()=>{});
})();
