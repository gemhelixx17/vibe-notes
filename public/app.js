/* Notaku: local-first PWA. Server mode when /api/health answers, otherwise localStorage. */
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
let notes=[], view='notes', labelFilter=null, colorFilter=null, selected=new Set(), editing=null, kind='note', items=[], imageData='', serverMode=false;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function plainText(s){const d=document.createElement('div');d.innerHTML=String(s||'');return d.textContent||''}
function textToHtml(t){return String(t||'').split(/\n\s*\n/).map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('')}
function bodyToHtml(b){const s=String(b||'');return /<[a-z][\s\S]*>/i.test(s)?sanitizeHTML(s):textToHtml(s)}
function sanitizeHTML(html){const doc=new DOMParser().parseFromString(String(html||''),'text/html');const allowed={B:1,I:1,U:1,S:1,STRONG:1,EM:1,MARK:1,CODE:1,P:1,BR:1,DIV:1,SPAN:1,H2:1,H3:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,PRE:1,A:1};
 doc.querySelectorAll('*').forEach(el=>{if(!allowed[el.tagName]){el.replaceWith(...el.childNodes);return} [...el.attributes].forEach(a=>{if(a.name==='href'&&el.tagName==='A'&&!/^(https?:|mailto:)/i.test(a.value))el.removeAttribute('href');else if(a.name!=='href')el.removeAttribute(a.name)})});return doc.body.innerHTML}
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;setTimeout(()=>t.hidden=true,2600)}
async function probe(){try{const r=await fetch('/api/health');serverMode=r.ok}catch(e){serverMode=false}$('#modeText').textContent=serverMode?'Tersimpan di server Anda (SQLite). Bisa dibuka dari perangkat lain di jaringan yang sama.':'Mode lokal di perangkat ini (penyimpanan browser). Jalankan server.py untuk mode server.'}
async function load(){await probe(); if(serverMode){try{notes=await (await fetch('/api/notes')).json()}catch(e){serverMode=false;notes=JSON.parse(localStorage.getItem('notaku.notes.v1')||'[]')}}else notes=JSON.parse(localStorage.getItem('notaku.notes.v1')||'[]'); if(!notes.length && !localStorage.getItem('notaku.seeded')){seed();localStorage.setItem('notaku.seeded','1')} render()}
function seed(){notes=[
 {id:uid(),title:'Selamat datang di Notaku',body:'Ini bukan Google Keep. Catatan ini tersimpan di server Anda sendiri.\n\nCoba: sematkan, beri label, atur pengingat, lalu ekspor sebagai cadangan.',items:[],labels:['mulai'],color:'sage',pinned:true,archived:false,trashed:false,reminderAt:'',repeat:'none',createdAt:Date.now(),updatedAt:Date.now(),history:[],image:''},
 {id:uid(),title:'Checklist pindahan server',body:'',items:[{id:uid(),text:'Jalankan python3 server.py',done:true},{id:uid(),text:'Buka dari HP di jaringan yang sama',done:false},{id:uid(),text:'Ekspor JSON pertama sebagai cadangan',done:false}],labels:['server'],color:'cream',pinned:false,archived:false,trashed:false,reminderAt:'',repeat:'none',createdAt:Date.now(),updatedAt:Date.now(),history:[],image:''},
]; persist(true)}
async function persist(silent){ if(serverMode){ /* server writes happen per-save below */ } else localStorage.setItem('notaku.notes.v1',JSON.stringify(notes)); if(!silent) render()}
async function saveNote(n){ n.updatedAt=Date.now(); if(serverMode){await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(n)})} else localStorage.setItem('notaku.notes.v1',JSON.stringify(notes)); render()}
async function deletePermanent(n){ if(serverMode){await fetch('/api/notes/'+n.id,{method:'DELETE'})} notes=notes.filter(x=>x.id!==n.id); if(!serverMode) localStorage.setItem('notaku.notes.v1',JSON.stringify(notes)); render()}
function filtered(){ let list=[...notes]; const q=$('#q').value.trim().toLowerCase();
 if(view==='notes') list=list.filter(n=>!n.archived&&!n.trashed);
 if(view==='pinned') list=list.filter(n=>n.pinned&&!n.archived&&!n.trashed);
 if(view==='reminders') list=list.filter(n=>n.reminderAt&&!n.trashed);
 if(view==='archive') list=list.filter(n=>n.archived&&!n.trashed);
 if(view==='trash') list=list.filter(n=>n.trashed);
 if(labelFilter) list=list.filter(n=>n.labels.includes(labelFilter));
 if(colorFilter) list=list.filter(n=>n.color===colorFilter);
 if(q) list=list.filter(n=>(n.title+' '+plainText(n.body)+' '+n.labels.join(' ')+' '+(n.items||[]).map(i=>i.text).join(' ')).toLowerCase().includes(q));
 const s=$('#sort').value; list.sort((a,b)=>s==='title'?a.title.localeCompare(b.title):s==='created'?b.createdAt-a.createdAt:b.updatedAt-a.updatedAt); return list}
function render(){ const list=filtered(); const pinned=list.filter(n=>n.pinned&&view==='notes'); const rest=view==='notes'?list.filter(n=>!n.pinned):list;
 $('#viewTitle').textContent={notes:'Catatan',pinned:'Disematkan',reminders:'Pengingat',archive:'Arsip',trash:'Sampah'}[view]||'Catatan';
 const total=notes.filter(n=>!n.trashed).length, rem=notes.filter(n=>n.reminderAt&&!n.trashed&&new Date(n.reminderAt)<new Date()).length;
 $('#stats').textContent=`${total} catatan aktif · ${notes.filter(n=>n.pinned&&!n.trashed).length} disematkan · ${rem} pengingat lewat waktu · mode: ${serverMode?'server':'lokal'}`;
 const labels=[...new Set(notes.flatMap(n=>n.labels))]; $('#labelList').innerHTML=labels.map(l=>`<button class="chip ${labelFilter===l?'active':''}" data-label="${esc(l)}">${esc(l)}</button>`).join('')||'<span class="muted">Belum ada label</span>';
 $$('#labelList .chip').forEach(b=>b.onclick=()=>{labelFilter=labelFilter===b.dataset.label?null:b.dataset.label;render()});
 const colors=[['default','Putih kertas','#fffdf8'],['cream','Krem','#fdf3d8'],['sage','Hijau sage','#e2ead9'],['blue','Biru abu','#dde5ea'],['blush','Merah muda','#f5dede'],['sand','Pasir','#efe3cf']];
 $('#colorFilter').innerHTML=colors.map(([v,l,c])=>`<button class="color-dot ${colorFilter===v?'active':''}" data-color="${v}" title="${l}" style="background:${c}" aria-label="${l}"></button>`).join('');
 $$('#colorFilter .color-dot').forEach(b=>b.onclick=()=>{colorFilter=colorFilter===b.dataset.color?null:b.dataset.color;render()});
 const card=n=>{ const done=(n.items||[]).filter(i=>i.done).length, tot=(n.items||[]).length; const overdue=n.reminderAt&&new Date(n.reminderAt)<new Date()&&!n.trashed;
  return `<article class="card ${selected.has(n.id)?'selected':''}" data-color="${n.color}" data-id="${n.id}">
   <input type="checkbox" class="select" ${selected.has(n.id)?'checked':''} aria-label="Pilih catatan">
   ${n.pinned?'<span class="pin">Disematkan</span>':''}
   ${n.image?`<img src="${n.image}" alt="">`:''}
   <h3>${esc(n.title)||'(Tanpa judul)'}</h3>
   ${n.body?(plainText(n.body).length>280?`<p>${esc(plainText(n.body).slice(0,280))}…</p>`:`<div class="rich-preview">${bodyToHtml(n.body)}</div>`):''}
   ${tot?`<div class="meta">${done}/${tot} selesai</div><div class="progress"><i style="width:${Math.round(done/tot*100)}%"></i></div>`:''}
   <div class="meta"><span>${fmt(n.updatedAt)}</span>${n.reminderAt?`<span style="color:${overdue?'#a33b2e':'inherit'}">${fmt(n.reminderAt)}${n.repeat!=='none'?' · ulang '+n.repeat:''}${overdue?' · lewat waktu':''}</span>`:''}<span>${n.body? plainText(n.body).split(/\s+/).filter(Boolean).length+' kata':''}</span></div>
   <div class="labels">${n.labels.map(l=>`<span>${esc(l)}</span>`).join('')}</div></article>`};
 let html=''; if(pinned.length) html+=`<h3>Disematkan</h3><div class="masonry ${$('#btnView').dataset.list==='1'?'list':''}">${pinned.map(card).join('')}</div>`;
 html+=`${pinned.length?'<h3>Lainnya</h3>':''}<div class="masonry ${$('#btnView').dataset.list==='1'?'list':''}">${rest.map(card).join('')}</div>`;
 $('#notes').innerHTML=html; $('#empty').hidden=list.length>0;
 $$('#notes .card').forEach(el=>{ el.onclick=e=>{ if(e.target.classList.contains('select')){ const id=el.dataset.id; e.stopPropagation(); if(selected.has(id))selected.delete(id);else selected.add(id); updateBulk(); render(); return } openEditor(notes.find(n=>n.id===el.dataset.id)) }});
 updateBulk();}
function updateBulk(){ const b=$('#bulkbar'); b.hidden=selected.size===0; $('#bulkCount').textContent=`${selected.size} dipilih`; }
function openEditor(n){ editing=n||null; kind=(n&&n.items&&n.items.length)?'checklist':'note'; items=n?JSON.parse(JSON.stringify(n.items||[])):([]); imageData=n?n.image||'':'';
 $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.kind===kind)); $('#edChecklist').hidden=kind!=='checklist'; $('#edBody').hidden=kind==='checklist'; $('#edToolbar').hidden=kind==='checklist';
 $('#edTitle').value=n?n.title:''; $('#edBody').innerHTML=n?bodyToHtml(n.body):'<p><br></p>'; $('#edLabels').value=n?n.labels.join(', '):''; $('#edReminder').value=n&&n.reminderAt?new Date(new Date(n.reminderAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):''; $('#edRepeat').value=n?n.repeat:'none'; $('#edColor').value=n?n.color:'default'; $('#edPinned').checked=n?!!n.pinned:false; $('#edArchived').checked=n?!!n.archived:false; $('#edImageName').textContent=n&&n.image?'Gambar terlampir':''; $('#edMeta').textContent=n?`Dibuat ${fmt(n.createdAt)} · diubah ${fmt(n.updatedAt)}`:'';
 $('#edHistory').innerHTML=n&&n.history&&n.history.length?`<strong>Riwayat (${n.history.length})</strong> `+n.history.slice(-5).reverse().map((h,i)=>`<button class="btn small" data-h="${n.history.length-1-i}">Pulihkan versi ${fmt(h.at)}</button>`).join(''):'';
 $$('#edHistory button').forEach(b=>b.onclick=()=>{const h=editing.history[+b.dataset.h]; $('#edTitle').value=h.title; $('#edBody').innerHTML=bodyToHtml(h.body); items=JSON.parse(JSON.stringify(h.items||[])); renderItems(); toast('Versi riwayat dimuat ke editor, simpan untuk menerapkan')});
 $('#btnDuplicate').hidden=!n; $('#btnTrash').hidden=!n||n.trashed; $('#btnDelete').hidden=!n||!n.trashed; $('#btnRestore').hidden=!n||!n.trashed;
 $('#composer').hidden=false; renderItems(); $('#edTitle').focus(); window.scrollTo({top:0,behavior:'smooth'})}
function renderItems(){ $('#edItems').innerHTML=items.map((it,i)=>`<div class="check-item"><input type="checkbox" ${it.done?'checked':''} data-i="${i}"><input type="text" class="${it.done?'done':''}" value="${esc(it.text)}" data-t="${i}"><button class="btn small" data-d="${i}">Hapus</button></div>`).join('');
 $$('#edItems input[type=checkbox]').forEach(c=>c.onchange=()=>{items[+c.dataset.i].done=c.checked;renderItems()});
 $$('#edItems input[type=text]').forEach(c=>c.onchange=()=>{items[+c.dataset.t].text=c.value});
 $$('#edItems button').forEach(b=>b.onclick=()=>{items.splice(+b.dataset.d,1);renderItems()}); }
function closeEditor(){ $('#composer').hidden=true; editing=null }
const templates={rapat:{title:'Rapat — ',body:'Tujuan:\n\nKeputusan:\n\nTindak lanjut:\n- ',items:[]},harian:{title:'Tugas hari ini',body:'',items:[{id:uid(),text:'Tugas terpenting hari ini',done:false},{id:uid(),text:'Balas pesan penting',done:false}]},belanja:{title:'Belanja',body:'',items:[{id:uid(),text:'',done:false}]},ide:{title:'Ide: ',body:'Masalah:\n\nIde:\n\nLangkah pertama:\n',items:[]}};
$('#btnNew').onclick=()=>openEditor(null); $('#btnEmptyNew').onclick=()=>openEditor(null);
$$('.tab').forEach(t=>t.onclick=()=>{kind=t.dataset.kind;$$('.tab').forEach(x=>x.classList.toggle('active',x===t));$('#edChecklist').hidden=kind!=='checklist';$('#edBody').hidden=kind==='checklist';$('#edToolbar').hidden=kind==='checklist'});
$('#edTemplate').onchange=e=>{const t=templates[e.target.value];if(!t)return;$('#edTitle').value=t.title;$('#edBody').innerHTML=textToHtml(t.body);items=JSON.parse(JSON.stringify(t.items));if(t.items.length){kind='checklist';$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.kind==='checklist'));$('#edChecklist').hidden=false;$('#edBody').hidden=true;$('#edToolbar').hidden=true}renderItems()};
$('#btnAddItem').onclick=()=>{const v=$('#edNewItem').value.trim();if(!v)return;items.push({id:uid(),text:v,done:false});$('#edNewItem').value='';renderItems()};
$('#edNewItem').onkeydown=e=>{if(e.key==='Enter')$('#btnAddItem').click()};
$('#edImage').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{imageData=r.result;$('#edImageName').textContent=f.name};r.readAsDataURL(f)};
$('#btnSave').onclick=async()=>{ const now=Date.now(); let n=editing||{id:uid(),createdAt:now,history:[],image:''};
 if(editing){ n.history=[...(n.history||[]),{at:n.updatedAt,title:n.title,body:n.body,items:n.items}].slice(-20) }
 n.title=$('#edTitle').value.trim(); n.body=kind==='note'?sanitizeHTML($('#edBody').innerHTML):''; n.items=kind==='checklist'?items:[]; n.labels=$('#edLabels').value.split(',').map(s=>s.trim()).filter(Boolean); n.reminderAt=$('#edReminder').value?new Date($('#edReminder').value).toISOString():''; n.repeat=$('#edRepeat').value; n.color=$('#edColor').value; n.pinned=$('#edPinned').checked; n.archived=$('#edArchived').checked; n.image=imageData||n.image||'';
 if(!editing) notes.unshift(n); else {const i=notes.findIndex(x=>x.id===n.id); if(i>=0) notes[i]=n}
 await saveNote(n); closeEditor(); toast('Catatan disimpan')};
$('#btnCancel').onclick=closeEditor;
$('#btnDuplicate').onclick=async()=>{const c=JSON.parse(JSON.stringify(editing));c.id=uid();c.title+=' (salinan)';c.createdAt=Date.now();c.history=[];notes.unshift(c);await saveNote(c);closeEditor();toast('Catatan diduplikat')};
$('#btnTrash').onclick=async()=>{editing.trashed=true;editing.trashedAt=Date.now();await saveNote(editing);closeEditor();toast('Dipindah ke sampah')};
$('#btnRestore').onclick=async()=>{editing.trashed=false;editing.archived=false;await saveNote(editing);closeEditor();toast('Catatan dipulihkan')};
$('#btnDelete').onclick=async()=>{if(!confirm('Hapus permanen? Tindakan ini tidak bisa dibatalkan.'))return;const n=editing;closeEditor();await deletePermanent(n);toast('Catatan dihapus permanen')};
$('#q').oninput=render; $('#sort').onchange=render;
$('#btnView').onclick=e=>{const list=e.target.dataset.list==='1'?'0':'1';e.target.dataset.list=list;e.target.textContent=list==='1'?'Tampilan grid':'Tampilan daftar';render()};
$('#btnTheme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('notaku.dark',document.body.classList.contains('dark')?'1':'0');$('#btnTheme').textContent=document.body.classList.contains('dark')?'Mode terang':'Mode gelap'};
if(localStorage.getItem('notaku.dark')==='1'){document.body.classList.add('dark');$('#btnTheme').textContent='Mode terang'}
$$('.nav-item').forEach(b=>b.onclick=()=>{view=b.dataset.view;$$('.nav-item').forEach(x=>x.classList.toggle('active',x===b));$('#sidebar').classList.remove('open');render()});
$('#btnMenu').onclick=()=>$('#sidebar').classList.toggle('open');
$('#btnClearFilter').onclick=()=>{labelFilter=null;colorFilter=null;$('#q').value='';render()};
$('#btnExport').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({app:'notaku',version:1,exportedAt:new Date().toISOString(),notes},null,2)],{type:'application/json'}));a.download='notaku-backup.json';a.click();toast('Cadangan JSON diunduh')};
$('#btnImport').onclick=()=>$('#fileImport').click();
$('#fileImport').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const d=JSON.parse(r.result);const incoming=d.notes||d;let added=0;for(const n of incoming){if(!notes.find(x=>x.id===n.id)){notes.push(n);added++;if(serverMode)await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(n)})}}if(!serverMode)localStorage.setItem('notaku.notes.v1',JSON.stringify(notes));render();toast(`${added} catatan diimpor`)}catch(err){toast('File impor tidak valid')}};r.readAsText(f)};
$('#btnBulkClear').onclick=()=>{selected.clear();render()};
$('#btnBulkArchive').onclick=async()=>{for(const id of selected){const n=notes.find(x=>x.id===id);if(n){n.archived=true;await saveNote(n)}}selected.clear();toast('Catatan diarsipkan')};
$('#btnBulkTrash').onclick=async()=>{for(const id of selected){const n=notes.find(x=>x.id===id);if(n){n.trashed=true;n.trashedAt=Date.now();await saveNote(n)}}selected.clear();toast('Catatan dipindah ke sampah')};
$('#btnBulkRestore').onclick=async()=>{for(const id of selected){const n=notes.find(x=>x.id===id);if(n){n.trashed=false;n.archived=false;await saveNote(n)}}selected.clear();toast('Catatan dipulihkan')};
document.addEventListener('keydown',e=>{if(e.key==='n'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){openEditor(null)} if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();$('#q').focus()}});

$$('#edToolbar button[data-cmd]').forEach(b=>b.onclick=()=>{$('#edBody').focus();document.execCommand(b.dataset.cmd,false,null)});
$$('#edToolbar button[data-block]').forEach(b=>b.onclick=()=>{$('#edBody').focus();document.execCommand('formatBlock',false,b.dataset.block)});
$('#btnLink').onclick=()=>{const u=prompt('Alamat tautan (https://…)');if(!u)return;$('#edBody').focus();document.execCommand('createLink',false,u)};
$('#btnHighlight').onclick=()=>{$('#edBody').focus();document.execCommand('hiliteColor',false,'#f2d65c')};
$('#edBody').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();document.execCommand('bold')} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='i'){e.preventDefault();document.execCommand('italic')} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='u'){e.preventDefault();document.execCommand('underline')}});
load();
