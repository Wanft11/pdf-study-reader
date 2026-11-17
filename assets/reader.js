'use strict';
const DATA=JSON.parse(document.getElementById('data').textContent),$=id=>document.getElementById(id),CONFIG=JSON.parse(document.getElementById('config').textContent),STORE='pdf-study-reader:v1:'+CONFIG.id;
const initial=()=>({version:1,edits:{},lang:CONFIG.languages[0],last:DATA[0].id,read:[],stars:[],notes:{},highlights:[],entries:[],labs:{},practice:{},revealed:[],sheet:{columns:2,font:9,line:1.25,margin:10,language:'original'}});
let state=initial(),storageOK=true,filter='all',course=DATA[0].course,page=0,sheetMode=false,selection=null,activePdfSource=null;
try{const saved=localStorage.getItem(STORE);if(saved){const s=JSON.parse(saved);if(s.version===1)state={...state,...s,sheet:{...state.sheet,...s.sheet}}}}catch(e){storageOK=false}
if(!CONFIG.languages.includes(state.lang))state.lang=CONFIG.languages[0];
$('lang').hidden=CONFIG.languages.length===1;
$('sheetLanguage').closest('label').hidden=CONFIG.languages.length===1;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const d=()=>DATA[page],lesson=()=>({...d()[state.lang],...state.edits?.[d().id]?.[state.lang]}),uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
function warn(){ $('storageWarning').classList.toggle('hide',storageOK);$('storageWarning').textContent=t('unavailable') }
function persist(){try{if(!storageOK)return false;localStorage.setItem(STORE,JSON.stringify(state));return true}catch(e){storageOK=false;warn();return false}}
let toastTimer;function toast(s){$('toast').textContent=s;$('toast').classList.remove('hide');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hide'),3200)}
function download(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function localPages(){return DATA.filter(x=>x.course===course)}
function setLanguage(){document.documentElement.lang=state.lang==='en'?'en':'zh-CN';document.querySelectorAll('[data-t]').forEach(el=>el.textContent=t(el.dataset.t));$('lang').textContent=state.lang==='en'?'中文':'English';for(const id of ['prev','next']){$(id).setAttribute('aria-label',t(id));$(id).title=t(id)}$('search').placeholder=state.lang==='en'?'Search slide text or page…':'搜索原页文字或页码……';$('pageNumber').setAttribute('aria-label',t('page'));$('note').placeholder=state.lang==='en'?'Your own words, questions or calculations…':'写下理解、疑问或计算过程……';$('course').replaceChildren(...CONFIG.documents.map(doc => new Option(doc.label, doc.id)));$('course').value=course;warn()}
function groupFor(x) {
 const groups = CONFIG.groups[x.course] || [];
 return groups.filter(group => group[0] <= x.num).at(-1) || [1, x.label, x.label];
}
function renderNav(scroll=false) {
 const q=$('search').value.trim(), nav=$('nav');
 const source=q?matchesFor(q):filter==='star'?DATA:localPages();
 const oldTop=nav.scrollTop;
 nav.replaceChildren();
 let last='',n=0;
 for(const x of source){
  if(filter==='lab'&&!x.lab || filter==='star'&&!state.stars.includes(x.id))continue;
  const group=groupFor(x),groupId=x.course+group[0];
  if(!q && last!==groupId){
   const h=document.createElement('div');h.className='chapter';h.textContent=(filter==='star'?x.label+' · ':'')+group[state.lang==='en'?2:1];nav.append(h);last=groupId;
  }
  const b=document.createElement('button');b.className='navrow';b.dataset.page=x.id;b.setAttribute('aria-current',x.id===d().id?'page':'false');
  b.innerHTML='<span class="navnum">'+esc(q?x.id:x.sourcePage)+'</span><span class="navtitle">'+esc(x[state.lang].title)+'</span><span class="navtag">'+(state.read.includes(x.id)?'✓ ':'')+(x.lab?t('labs'):'')+'</span>';
  b.onclick=()=>{if(sheetMode)navigateSource(x.id);else gotoId(x.id)};nav.append(b);n++;
 }
 if(!n)nav.textContent=t('noMatch');
 const read=localPages().filter(x=>state.read.includes(x.id)).length, total=DATA.filter(x=>state.read.includes(x.id)).length;
 $('progressText').textContent=`${read} / ${localPages().length} · ${t('allProgress')} ${total} / ${DATA.length}`;
 $('progress').max=DATA.length;$('progress').value=total;
 document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 nav.scrollTop=oldTop;
 const current=scroll&&nav.querySelector('[aria-current="page"]');
 if(current){
  const item=current.getBoundingClientRect(),box=nav.getBoundingClientRect();
  if(item.top<box.top)nav.scrollTop+=item.top-box.top;
  if(item.bottom>box.bottom)nav.scrollTop+=item.bottom-box.bottom;
 }
}
function render(keepSlide=false){setLanguage();const x=d(),l=lesson();$('main').classList.toggle('hide',sheetMode);$('sheetView').classList.toggle('hide',!sheetMode);$('crumb').textContent=`${x.label} · ${t('page')} ${x.sourcePage} / ${CONFIG.documents.find(doc=>doc.id===x.course).total}`;$('title').textContent=l.title;$('originalTitle').textContent=x.original;renderIdea(x,l);formatStudyAnswer($('body'),l.body,DATA.map(page=>page.id),studySourceButton);$('key').textContent=l.key;$('question').textContent=l.question;formatStudyAnswer($('answer'),l.answer,DATA.map(page=>page.id),studySourceButton);if(keepSlide)updatePdfSourceStatus();else renderSlide(x);$('star').textContent=t(state.stars.includes(x.id)?'unstar':'star');$('star').setAttribute('aria-pressed',String(state.stars.includes(x.id)));$('read').textContent=t(state.read.includes(x.id)?'unread':'read');$('read').setAttribute('aria-pressed',String(state.read.includes(x.id)));$('note').value=state.notes[x.id]||'';$('noteStatus').textContent=t(storageOK?'stored':'unavailable');$('pageNumber').value=x.sourcePage;$('pageNumber').max=CONFIG.documents.find(doc=>doc.id===course).total;$('pageTotal').textContent='/ '+$('pageNumber').max;$('prev').disabled=$('bottomPrev').disabled=x.num===1;$('next').disabled=x.num===localPages().length;$('readNext').textContent=t(x.num===localPages().length?'complete':'readNext');$('sourceBack').classList.toggle('hide',!history.state?.sourceReturn);reviewPageLabel();refreshKeyButtons();$('sourceTextHint').textContent=x.lines.length?t('selectSlide'):(state.lang==='zh'?'扫描页无可选文字':'No selectable text on this page');renderRelations();renderHighlights();applyHighlights(keepSlide);renderNav(true);if(sheetMode)renderSheet();document.title=l.title+' · '+CONFIG.title}
function studySourceButton({id, start, end}) {
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'sourceLink';
 const source = DATA.find(page => page.id === id);
 button.textContent = source.label + ' · ' + source.sourcePage;
 button.onclick = () => navigateSource(id, {start,end});
 return button;
}
function pdfSourceLabel({start, end}) {
  const lines = start === end ? String(start) : start + '–' + end;
  return t(start === end ? 'pdfSourceLine' : 'pdfSourceRange').replace('{lines}', lines);
}

function renderIdea(page, content) {
 $('idea').textContent = content.idea;
}
function isPdfSourceRange(page, source) {
  if (source?.id !== page.id) return false;
  const {start, end} = source;
  const count = end - start + 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 ||
      end > (page.lines?.length || 0) || count < 1 || count > 8) return false;
  const usable = line => !line.answer && !!line.t.trim();
  return page.lines.slice(start - 1, end).every(usable) &&
    (count === 1 || count < page.lines.filter(usable).length);
}
function updatePdfSourceStatus() {
  const status = $('pdfSourceStatus');
  const label = $('zoomLocations').childElementCount ? pdfSourceLabel(activePdfSource) : '';
  if (status.textContent !== label) status.textContent = label;
}
const pdfTextMetrics = document.createElement('canvas').getContext('2d');
pdfTextMetrics.font = '100px Arial, sans-serif';

function renderSlide(x) {

  const location = activePdfSource;
  const slide = $('slide'), layer = $('textLayer'), zoomLayer = $('zoomLocations');
  slide.src = x.img;
  slide.alt = x.label + ' ' + x.sourcePage + ' — ' + x.original;
  slide.style.aspectRatio = 'auto ' + x.ratio;
  layer.replaceChildren();
  zoomLayer.replaceChildren();
  for (const [index, line] of (x.lines || []).entries()) {
    const number = index + 1;
    const bounds = `left:${line.x}%;top:${line.y}%;width:${line.w}%;height:${line.h}%`;
    const span = document.createElement('span');
    const text = document.createElement('span');
    span.className = 'sourceLine';
    span.dataset.line = index;
    span.style.cssText = bounds;
    text.className = 'sourceText';
    text.textContent = line.t;
    const inkHeight = line.ink ? (line.ink[1] - line.ink[0]) / 100 : line.h;
    if (line.ink && line.h > 0) {
      const midpoint = (line.ink[0] + line.ink[1]) / 200;
      text.style.top = `${(midpoint - line.y) / line.h * 100}%`;
    }
    const size = inkHeight / x.ratio * .85;
    const width = pdfTextMetrics.measureText(line.t).width * size / 100;
    text.style.transform = `translateY(-50%) scaleX(${width > 0 ? line.w / width : 1})`;
    text.style.fontSize = `${size}cqw`;
    span.append(text);
    layer.append(span);
    if (location && number >= location.start && number <= location.end) {
      span.classList.add('locatedLine');
      const marker = document.createElement('span');
      marker.className = 'locatedLine';
      marker.style.cssText = bounds;
      zoomLayer.append(marker);
    }
  }
  updatePdfSourceStatus();
}

function openSlideZoom() {
  const dialog = $('zoomDialog'), image = $('zoomImage');
  image.src = $('slide').src;
  image.alt = d().original;
  image.style.aspectRatio = 'auto ' + d().ratio;
  $('zoomTitle').textContent = d().label + ' ' + d().sourcePage;
  dialog.showModal();
  dialog.scrollTop = 0;
  const marker = $('zoomLocations').firstElementChild;
  if (marker) requestAnimationFrame(() => {
    if (!dialog.open || !marker.isConnected) return;
    const line = marker.getBoundingClientRect(), viewport = dialog.getBoundingClientRect();
    if (line.bottom > viewport.bottom) dialog.scrollTop = line.top - viewport.top - dialog.clientHeight / 2;
  });
}
function switchLanguage() {
  const toolbar = document.querySelector('.toolbar');
  const oldY = window.scrollY;
  const readingLine = toolbar.getBoundingClientRect().bottom + 16;
  const slideIsSticky = getComputedStyle(document.querySelector('.slidecol')).position === 'sticky';
  const selectors = sheetMode
    ? '.sheetbar, .sheetsettings, #sheetEntries, #front, #back'
    : '#title, #slide, #idea, #keyBox, #body, #links, .quiz, #annotations, .notebox, .bottomnav';
  let anchor;
  for (const element of document.querySelectorAll(selectors)) {
    if (element === $('slide') && slideIsSticky) continue;
    const rect = element.getBoundingClientRect();
    if (rect.height && rect.top <= readingLine && (!anchor || rect.top >= anchor.rect.top)) {
      anchor = {element, rect};
    }
  }
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  persist();
  clearSelection();
  render(true);
  if (!oldY || !anchor) {
    window.scrollTo(0, oldY);
    return;
  }
  const {element, rect} = anchor;
  const updated = element.getBoundingClientRect();
  const progress = Math.min(1, (readingLine - rect.top) / rect.height);
  const gap = Math.max(0, readingLine - rect.bottom);
  const newReadingLine = toolbar.getBoundingClientRect().bottom + 16;
  window.scrollBy(0, updated.top + updated.height * progress + gap - newReadingLine);
}

function gotoId(id, pdfSource = null) {
  const index = DATA.findIndex(x => x.id === id);
  if (index < 0) return;
  const pageChanged = index !== page;
  page = index;
  course = d().course;
  activePdfSource = isPdfSourceRange(d(), pdfSource) ? pdfSource : null;
  state.last = id;
  persist();
  history.replaceState({...history.state, pdfSource: activePdfSource}, '', '#' + id);
  if (pageChanged) {
    $('answerDetail').open = false;
    $('links').open = false;
  }
  clearSelection();
  $('shell').classList.remove('menuopen');
  render();
  if (pageChanged) document.dispatchEvent(new Event('readerpagechange'));
  window.scrollTo({top:0});
}
function step(n){const p=localPages(),i=p.findIndex(x=>x.id===d().id),target=p[i+n];if(target)gotoId(target.id)}
function renderRelations(){const matches=(d().related||[]).map(id=>DATA.find(x=>x.id===id)).filter(Boolean);$('links').replaceChildren();$('links').classList.toggle('hide',!matches.length);if(!matches.length)return;const h=document.createElement('summary');h.textContent=t('related')+' · '+matches.length;$('links').append(h);for(const m of matches){const b=document.createElement('button');b.textContent=`${m.label} ${m.num} · ${m[state.lang].title}`;b.onclick=()=>navigateSource(m.id);$('links').append(b)}}
function toggle(key){const id=d().id;state[key]=state[key].includes(id)?state[key].filter(x=>x!==id):[...state[key],id];persist();$(key==='stars'?'star':'read').textContent=t(key==='stars'?(state.stars.includes(id)?'unstar':'star'):(state.read.includes(id)?'unread':'read'));$(key==='stars'?'star':'read').setAttribute('aria-pressed',state[key].includes(id));renderNav()}
function clearSelection(clearNative = true) {
  if (clearNative) window.getSelection()?.removeAllRanges();
  selection = null;
  $('pdfSelection').replaceChildren();
  $('selectionTools').classList.add('hide');
}
function captureSelection() {
  const current = window.getSelection();
  if (sheetMode || !current || current.isCollapsed || !current.rangeCount) {
    clearSelection(false);
    return;
  }
  const range = current.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const region = element?.closest('[data-region]');
  if (!region) {
    clearSelection(false);
    return;
  }
  const quote = range.toString();
  if (!quote.trim() || quote.length > 20000) {
    clearSelection(false);
    return;
  }
  const before = document.createRange();
  before.selectNodeContents(region);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  selection = {page:d().id, region:region.dataset.region, start, end:start+quote.length, quote, lang:state.lang};
  paintPdfHighlights($('pdfSelection'),
    region === $('textLayer') && quote.trim() !== region.textContent.trim() ? [selection] : []);
  $('selectionTools').classList.remove('hide');
}
function pdfLineRanges(start, end) {
  const ranges = [];
  let offset = 0;
  for (const span of $('textLayer').children) {
    const text = span.textContent;
    const from = Math.max(0, start - offset);
    const to = Math.min(text.length, end - offset);
    if (from < to) ranges.push({index:Number(span.dataset.line), from, to, text:text.slice(from, to)});
    offset += text.length;
    if (offset >= end) break;
  }
  return ranges;
}
function pdfHighlightBounds(line, from, to) {
  if (!line.t.slice(from, to).trim()) return null;
  if (line.ink) {
    const [top, bottom, positions] = line.ink;
    let left = Infinity, right = -Infinity;
    for (let i = from * 2; i < to * 2; i += 2) {
      if (positions[i] < 0) continue;
      left = Math.min(left, positions[i]);
      right = Math.max(right, positions[i + 1]);
    }
    if (right > left) return [left / 100, top / 100, (right - left) / 100, (bottom - top) / 100];
  }
  const width = pdfTextMetrics.measureText(line.t).width;
  if (!width) return null;
  const start = pdfTextMetrics.measureText(line.t.slice(0, from)).width / width;
  const end = pdfTextMetrics.measureText(line.t.slice(0, to)).width / width;
  return [line.x + line.w * start, line.y, line.w * (end - start), line.h];
}
function paintPdfHighlights(layer, highlights) {
  const ranges = highlights.flatMap(h => pdfLineRanges(h.start, h.end))
    .sort((a, b) => a.index - b.index || a.from - b.from);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous?.index === range.index && previous.to >= range.from) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push(range);
    }
  }
  const boxes = [];
  for (const {index, from, to} of merged) {
    const bounds = pdfHighlightBounds(d().lines[index], from, to);
    if (!bounds) continue;
    const [left, top, width, height] = bounds;
    const box = document.createElement('span');
    box.style.cssText = `left:${left}%;top:${top}%;width:${width}%;height:${height}%`;
    boxes.push(box);
  }
  layer.replaceChildren(...boxes);
}
function selectedHighlight(add){
 if(!selection){toast(t('noSelection'));return}
 const s=state.highlights.find(h=>h.page===selection.page&&h.region===selection.region&&h.start===selection.start&&h.end===selection.end&&h.lang===selection.lang&&h.quote===selection.quote)||{...selection,id:uid()};
 if(!state.highlights.includes(s)){state.highlights.push(s);persist()}
 clearSelection();renderHighlights();applyHighlights();
 if(add)openExcerpt(s.quote,s.page,s.lang);else toast(t('marked'));
}
function applyHighlights(keepSlide=false){
 if(!keepSlide){
  const text=$('textLayer').textContent;
  const marks=state.highlights.filter(h=>h.page===d().id&&h.region==='slide'&&text.slice(h.start,h.end)===h.quote);
  paintPdfHighlights($('pdfMarks'),marks);
 }
 for(const region of document.querySelectorAll('[data-region]:not(#textLayer)')){region.querySelectorAll('mark').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));region.normalize();const marks=state.highlights.filter(h=>h.page===d().id&&h.region===region.dataset.region&&h.lang===state.lang).sort((a,b)=>a.start-b.start);if(!marks.length)continue;const visibleText=region.textContent;const nodes=[],walker=document.createTreeWalker(region,NodeFilter.SHOW_TEXT);let p=0,n;while(n=walker.nextNode()){nodes.push({n,start:p,end:p+n.textContent.length});p+=n.textContent.length}for(const item of nodes){const hits=marks.filter(h=>h.start<item.end&&h.end>item.start&&visibleText.slice(h.start,h.end)===h.quote);if(!hits.length)continue;const str=item.n.textContent,cuts=new Set([0,str.length]);hits.forEach(h=>{cuts.add(Math.max(0,h.start-item.start));cuts.add(Math.min(str.length,h.end-item.start))});const sorted=[...cuts].sort((a,b)=>a-b),frag=document.createDocumentFragment();for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i],active=hits.find(h=>h.start<=item.start+a&&h.end>=item.start+b),child=active?document.createElement('mark'):document.createTextNode('');child.textContent=str.slice(a,b);frag.append(child)}item.n.replaceWith(frag)}}}
function renderHighlights(){const container=$('highlightList');container.replaceChildren();const hs=state.highlights.filter(h=>h.page===d().id);if(!hs.length){container.textContent=t('empty');return}for(const h of hs){const row=document.createElement('div');row.className='highlightRow';const q=document.createElement('blockquote');q.textContent=h.region==='slide' && $('textLayer').textContent.slice(h.start,h.end)===h.quote
 ? pdfLineRanges(h.start,h.end).map(line=>line.text).join('\n')
 : h.quote;row.append(q);const add=document.createElement('button');add.textContent=t('addSelection');add.onclick=()=>{addEntry(h.quote,h.page,h.lang,h.id)};const del=document.createElement('button');del.textContent=t('delete');del.onclick=()=>{if(confirm(t('confirmMark'))){state.highlights=state.highlights.filter(x=>x.id!==h.id);persist();renderHighlights();applyHighlights()}};row.append(add,del);container.append(row)}}
function addEntry(text,pageId=d().id,lang=state.lang,highlight=null,extra={}){
 if(!text.trim()){toast(t('emptyNote'));return false}
 if(alreadyCollected(text,pageId,extra.sourceKey)){toast(t('alreadyAdded'));return false}
 state.entries.push({id:uid(),page:pageId,text,lang,highlight,side:'front',category:'concept',...extra});
 persist();refreshKeyButtons();toast(t('added'));return true;
}
function exportNotes() {
 const blocks = ['# ' + CONFIG.title + ' · ' + t('exportName')];
 for (const page of DATA) {
  const note = state.notes[page.id];
  const marks = state.highlights.filter(mark => mark.page === page.id);
  if (!note && !marks.length && !state.stars.includes(page.id)) continue;
  blocks.push('## ' + page.id + ' · ' + page[state.lang].title);
  if (note) blocks.push(note);
  for (const mark of marks) blocks.push('> ' + mark.quote.replace(/\n/g, '\n> '));
 }
 download('study-notes.md',blocks.join('\n\n'),'text/markdown;charset=utf-8');
}
function renderSheet(){const cfg=state.sheet;$('sheetLanguage').value=cfg.language||'original';$('columns').value=cfg.columns;$('fontSize').value=cfg.font;$('lineHeight').value=cfg.line;$('margin').value=cfg.margin;$('sheetEntries').replaceChildren();if(!state.entries.length)$('sheetEntries').textContent=t('empty');state.entries.forEach((e,index)=>{const row=document.createElement('section');row.className='entry';const top=document.createElement('div');top.className='entrytools';for(const [label,action] of [['up',()=>moveEntry(index,-1)],['down',()=>moveEntry(index,1)],['delete',()=>{if(confirm(t('confirmDelete'))){state.entries.splice(index,1);persist();renderSheet()}}]]){const b=document.createElement('button');b.textContent=t(label);b.onclick=action;top.append(b)}const side=document.createElement('select');side.setAttribute('aria-label',t('front')+' / '+t('backside'));for(const [value,label] of [['front','front'],['back','backside']])side.add(new Option(t(label),value));side.value=e.side;side.onchange=()=>{e.side=side.value;persist();updatePaper()};top.append(side);const cat=document.createElement('select');cat.setAttribute('aria-label',t('category'));for(const k of ['concept','formula','trap','template'])cat.add(new Option(t(k),k));cat.value=e.category;cat.onchange=()=>{e.category=cat.value;persist();updatePaper()};top.append(cat);const textarea=document.createElement('textarea');textarea.value=e.text;textarea.setAttribute('aria-label',t('edit'));textarea.oninput=()=>{e.text=textarea.value;delete e.translations;persist();updatePaper()};const link=document.createElement('button');link.className='sourceLink';const src=DATA.find(x=>x.id===e.page);link.textContent=src?t('source')+': '+src.id+' · '+src[state.lang].title:t('entryLang');link.onclick=()=>{if(src)navigateSource(src.id)};row.append(top,textarea,link);$('sheetEntries').append(row)});updatePaper()}
function entryText(e){const l=state.sheet.language;return e.translations&&l==='both'?e.translations.zh+'\n'+e.translations.en:e.translations&&['zh','en'].includes(l)?e.translations[l]:e.text}
function moveEntry(i,dir){const j=i+dir;if(j<0||j>=state.entries.length)return;[state.entries[i],state.entries[j]]=[state.entries[j],state.entries[i]];persist();renderSheet()}
function updatePaper(){const cfg=state.sheet;for(const side of ['front','back']){const paper=$(side);paper.style.setProperty('--sheet-font',cfg.font+'pt');paper.style.setProperty('--sheet-line',cfg.line);paper.style.setProperty('--sheet-cols',cfg.columns);paper.style.setProperty('--sheet-margin',cfg.margin+'mm');const body=paper.querySelector('.paperbody');body.replaceChildren();for(const e of state.entries.filter(x=>x.side===side)){const div=document.createElement('div');div.className='paperentry';div.dataset.category=e.category;const small=document.createElement('strong');small.textContent=t(e.category)+(e.page?' · '+e.page:'');const text=document.createElement('div');text.className='paperText';formatStudyAnswer(text,entryText(e),[]);div.append(small,text);body.append(div)}}requestAnimationFrame(checkOverflow)}
function checkOverflow(){if(!sheetMode)return false;const box=document.querySelector('.sheetpreview');const scale=Math.min(1,Math.max(.15,(box.clientWidth-8)/(210*96/25.4)));for(const wrap of box.querySelectorAll('.paperwrap'))wrap.style.zoom=String(scale);const overflowSides=[];for(const id of ['front','back']){const p=$(id),b=p.querySelector('.paperbody'),overflow=b.scrollWidth>b.clientWidth+2||b.scrollHeight>b.clientHeight+2;p.classList.toggle('overfull',overflow);if(overflow)overflowSides.push(t(id==='front'?'front':'backside'))}const bad=overflowSides.length>0;$('overflow').textContent=bad?overflowSides.join(' / ')+' · '+t('overflow'):t('fits');$('overflow').classList.toggle('bad',bad);$('printSheet').disabled=bad;return bad}
function printSheet(){if(checkOverflow()){toast(t('printFirst'));return}document.body.classList.add('printingSheet');window.print()}
let printOpen=[];window.addEventListener('beforeprint',()=>{printOpen=[...document.querySelectorAll('#main details')].map(x=>[x,x.open]);if(!document.body.classList.contains('printingSheet'))printOpen.forEach(([x])=>x.open=true)});window.addEventListener('afterprint',()=>{document.body.classList.remove('printingSheet');printOpen.forEach(([x,open])=>x.open=open)});
$('prev').onclick=$('bottomPrev').onclick=()=>step(-1);$('next').onclick=()=>step(1);$('readNext').onclick=()=>{if(!state.read.includes(d().id))state.read.push(d().id);persist();if(d().num<localPages().length)step(1);else{render();toast(t('complete'))}};$('course').onchange=()=>{sheetMode=false;gotoId(DATA.find(x=>x.course===$('course').value).id)};$('jumpForm').onsubmit=e=>{e.preventDefault();const input=$('pageNumber');if(!input.checkValidity())return;const target=localPages().find(item=>item.sourcePage===Number(input.value));if(target)gotoId(target.id);else{input.value=d().sourcePage;toast(state.lang==='zh'?'预览未包含该页':'Page not included in this preview')}};$('lang').onclick=switchLanguage;$('star').onclick=()=>toggle('stars');$('read').onclick=()=>toggle('read');$('search').oninput=()=>renderNav();document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderNav()});$('note').oninput=()=>{state.notes[d().id]=$('note').value;$('noteStatus').textContent=t(persist()?'stored':'unavailable')};$('addKey').onclick=addTakeaway;$('addNote').onclick=()=>{if(!$('note').value.trim())toast(t('emptyNote'));else openExcerpt($('note').value,d().id,state.lang)};$('export').onclick=exportNotes;$('menu').onclick=()=>{if($('shell').classList.toggle('menuopen'))renderNav(true)};$('zoom').onclick=openSlideZoom;document.querySelector('.slideframe').addEventListener('click',e=>{if(e.target===$('textLayer')&&window.getSelection()?.isCollapsed)$('zoom').click()});$('closeZoom').onclick=()=>$('zoomDialog').close();$('zoomDialog').onclick=e=>{if(e.target===$('zoomDialog'))$('zoomDialog').close()};let readerScroll=0;$('openSheet').onclick=()=>{if(!sheetMode)readerScroll=scrollY;sheetMode=true;clearSelection();render();window.scrollTo(0,0)};$('closeSheet').onclick=()=>{sheetMode=false;render();requestAnimationFrame(()=>window.scrollTo(0,readerScroll))};$('newEntry').onclick=()=>{state.entries.push({id:uid(),text:'',page:d().id,lang:state.lang,side:'front',category:'concept'});persist();renderSheet()};$('printSheet').onclick=printSheet;$('exportSheet').onclick=()=>download('cheat-sheet.md',state.entries.map(e=>'## '+t(e.side==='front'?'front':'backside')+' · '+t(e.category)+' · '+(e.page||'')+'\n\n'+entryText(e)).join('\n\n'),'text/markdown;charset=utf-8');$('sheetLanguage').onchange=()=>{state.sheet.language=$('sheetLanguage').value;persist();updatePaper()};for(const id of ['columns','fontSize','lineHeight','margin'])$(id).oninput=()=>{state.sheet={...state.sheet,columns:Number($('columns').value),font:Math.max(7,Math.min(16,Number($('fontSize').value)||9)),line:Math.max(1,Math.min(1.8,Number($('lineHeight').value)||1.25)),margin:Math.max(5,Math.min(20,Number($('margin').value)||10))};persist();updatePaper()};document.addEventListener('selectionchange',captureSelection);document.addEventListener('mouseup',()=>setTimeout(captureSelection,0));document.addEventListener('touchend',()=>setTimeout(captureSelection,100));$('selectionTools').onmousedown=e=>e.preventDefault();$('markSelection').onclick=()=>selectedHighlight(false);$('sheetSelection').onclick=()=>selectedHighlight(true);document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='k'){e.preventDefault();$('shell').classList.add('menuopen');$('search').focus()}return}if(sheetMode||$('zoomDialog').open||/INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();step(1)}if(e.key==='ArrowLeft'){e.preventDefault();step(-1)}});window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(id!==d().id)gotoId(id)});window.addEventListener('resize',()=>{if(sheetMode)checkOverflow()});


const toolbar = document.querySelector('.toolbar');
const moreMenu = $('moreMenu');
const moreSummary = moreMenu.querySelector('summary');
const themeChoices = [...moreMenu.querySelectorAll('input[name="readerTheme"]')];
const themeStore = STORE + ':theme';
let savedTheme;
try {
  savedTheme = localStorage.getItem(themeStore);
} catch {
  // The reader already reports when browser storage is unavailable.
}
const currentTheme = themeChoices.find(choice => choice.value === savedTheme) || themeChoices[0];
currentTheme.checked = true;
document.documentElement.dataset.theme = currentTheme.value;

moreMenu.addEventListener('change', event => {
  if (!themeChoices.includes(event.target)) return;
  document.documentElement.dataset.theme = event.target.value;
  try {
    localStorage.setItem(themeStore, event.target.value);
  } catch {
    storageOK = false;
    warn();
  }
});
function closeMoreMenu() {
  moreMenu.open = false;
  moreSummary.focus();
}
$('moreActions').addEventListener('click', event => {
  if (event.target.closest('button')) closeMoreMenu();
}, {capture: true});
moreMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && moreMenu.open) {
    event.stopPropagation();
    closeMoreMenu();
  }
});
document.addEventListener('pointerdown', event => {
  if (moreMenu.open && !moreMenu.contains(event.target)) moreMenu.open = false;
});
moreMenu.addEventListener('focusout', event => {
  if (event.relatedTarget && !moreMenu.contains(event.relatedTarget)) moreMenu.open = false;
});

const measureToolbar = () => toolbar.parentElement.style.setProperty(
  '--toolbar-height', toolbar.getBoundingClientRect().height + 'px'
);
measureToolbar();
new ResizeObserver(measureToolbar).observe(toolbar);

document.documentElement.dataset.mode=CONFIG.mode;
const requestedPage=location.hash.slice(1);
gotoId([requestedPage,state.last].find(id=>DATA.some(page=>page.id===id)) || DATA[0].id);
