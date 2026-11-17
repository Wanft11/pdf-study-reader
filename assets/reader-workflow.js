const cleanSearch = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function matchesFor(query) {
  const key = cleanSearch(query);
  if (!key) return localPages();
  const exact = DATA.find(page => cleanSearch(page.id) === key);
  if (exact) return [exact];
  const address = key.match(/^(d[0-9a-f]{10})0*(\d+)$/);
  if (address) {
    const code = address[1].toUpperCase();
    const number = Number(address[2]);
    return DATA.filter(page => page.course === code && (page.sourcePage === number || cleanSearch(page.id) === key));
  }
  if (/^\d+$/.test(key)) return localPages().filter(page => page.sourcePage === Number(key));
  const tokens = query.trim().split(/\s+/).map(cleanSearch).filter(Boolean);
  return DATA.map(page => {
    const title = cleanSearch([page.original, page.zh.title, page.en.title, ...(page.tags || [])].join(' '));
    const body = cleanSearch([page.zh.idea, page.zh.body, page.en.idea, page.en.body, page.sourceText].join(' '));
    return {page, rank: title.includes(key) ? 3 : body.includes(key) ? 2 :
      tokens.every(token => title.includes(token) || body.includes(token)) ? 1 : 0};
  }).filter(result => result.rank).sort((a, b) => b.rank - a.rank).map(result => result.page);
}

function setReview(id, marked) {
  const items = new Set(state.review || []);
  if (marked) items.add(id); else items.delete(id);
  state.review = [...items];
  persist();
}
function reviewPageLabel() {
  const marked = (state.review || []).includes(d().id);
  $('reviewPage').textContent = t(marked ? 'reviewOn' : 'review');
  $('reviewPage').setAttribute('aria-pressed', marked);
}

function scrollToPdfSource() {
  if (!activePdfSource || sheetMode) return;
  requestAnimationFrame(() => {
    const lines = $('textLayer').querySelectorAll('.locatedLine');
    const first = lines[0], last = lines[lines.length - 1];
    if (!first || sheetMode) return;
    const line = first.getBoundingClientRect();
    const toolbarBottom = document.querySelector('.toolbar').getBoundingClientRect().bottom;
    const top = Math.max(0, toolbarBottom) + 8;
    const bottom = window.innerHeight - 8;
    const rangeBottom = last.getBoundingClientRect().bottom;
    if (line.top >= top && rangeBottom <= bottom) return;
    const focusBottom = rangeBottom - line.top > bottom - top ? line.bottom : rangeBottom;
    window.scrollBy(0, (line.top + focusBottom - top - bottom) / 2);
  });
}

function showSourcePage() {
  if ($('reviewDialog').open) $('reviewDialog').close();
  sheetMode = false;
}

function navigateSource(id, pdfSource = null) {
  if (!DATA.some(page => page.id === id)) return;
  const reviewOpen = $('reviewDialog').open;
  history.replaceState({...history.state, readerView: {
    id:d().id, y:scrollY, sheet:sheetMode, review:reviewOpen,
    reviewY:$('reviewList').scrollTop,
    relatedOpen:$('links').open, answerOpen:$('answerDetail').open
  }}, '', location.href);
  history.pushState({sourceReturn:true, pdfSource}, '', '#'+id);
  showSourcePage();
  gotoId(id, pdfSource);
  scrollToPdfSource();
}
function restoreReaderView(view) {
  sheetMode = !!view?.sheet;
  if (!view && history.state?.sourceReturn) showSourcePage();
  gotoId(view?.id || location.hash.slice(1) || state.last, history.state?.pdfSource);
  if (!view) {
    scrollToPdfSource();
    return;
  }
  $('links').open = !!view.relatedOpen;
  $('answerDetail').open = !!view.answerOpen;
  if (view.review) $('openReview').click();
  requestAnimationFrame(() => {
    window.scrollTo(0,view.y);
    $('reviewList').scrollTop = view.reviewY;
  });
}
window.addEventListener('popstate', event => restoreReaderView(event.state?.readerView));
$('sourceBack').onclick = () => history.back();

function alreadyCollected(text, pageId, key) {
  return state.entries.some(entry => entry.page === pageId &&
    ((key && entry.sourceKey === key) || entry.text.trim() === text.trim()));
}
function refreshKeyButtons() {
  const added = alreadyCollected(lesson().key, d().id, 'takeaway');
  $('addKey').disabled = added;
  $('addKey').textContent = t(added ? 'alreadyAdded' : 'addKey');
}
function addTakeaway() {
  const page = d();
  const key = lesson().key;
  const translations = key === page[state.lang].key ? {zh:page.zh.key,en:page.en.key} : null;
  openExcerpt(key, page.id, state.lang, 'takeaway', translations);
}
function openExcerpt(text, pageId, lang, sourceKey = null, translations = null) {
  const dialog = $('clipDialog');
  const source = DATA.find(page => page.id === pageId);
  $('clipSource').textContent = source ? source.label + ' · ' + source.sourcePage : pageId;
  const field = $('clipText');
  field.value = text;
  const update = () => formatStudyAnswer($('clipPreview'),field.value,[]);
  field.oninput = update;
  $('clipForm').onsubmit = event => {
    event.preventDefault();
    if (!field.value.trim()) return;
    const value = field.value.trim();
    const extra = translations && value === text.trim() ? {sourceKey, translations} : {sourceKey};
    addEntry(value,pageId,lang,null,extra);
    dialog.close();
  };
  update();
  dialog.showModal();
}
$('closeClip').onclick = () => $('clipDialog').close();

const reviewSelected = new Set();
function renderReview() {
  const list = $('reviewList');
  const scroll = list.scrollTop;
  list.replaceChildren();
  const selected = [];
  function update() {
    const count = selected.filter(item => item.control.checked).length;
    $('collectReview').disabled = count === 0;
    $('reviewStatus').textContent = count ? (state.lang === 'en' ? count + ' selected' : '已选 ' + count + ' 条') : '';
  }
  function row(pageId, label, item) {
    const page = DATA.find(entry => entry.id === pageId);
    if (!page) return;
    const node = document.createElement('article');
    node.className = 'reviewItem';
    const name = document.createElement('strong');
    name.textContent = label;
    const link = document.createElement('button');
    link.textContent = page.label + ' · ' + page.sourcePage;
    link.onclick = () => navigateSource(pageId);
    const choice = document.createElement('label');
    const control = document.createElement('input');
    control.type = 'checkbox';
    control.disabled = alreadyCollected(item.text,pageId,item.sourceKey);
    const key = pageId + ':' + (item.sourceKey || item.highlight || item.text);
    control.checked = !control.disabled && reviewSelected.has(key);
    control.onchange = () => {
      if (control.checked) reviewSelected.add(key); else reviewSelected.delete(key);
      update();
    };
    choice.append(control,t(control.disabled ? 'alreadyAdded' : 'quickClip'));
    selected.push({control,...item,pageId});
    node.append(name,link,choice);
    list.append(node);
  }
  const marked = new Set([...(state.review || []),...state.stars]);
  for (const id of marked) {
    const [pageId,question] = id.split(' ');
    const page = DATA.find(entry => entry.id === pageId);
    if (!page) continue;
    const content = page.questions?.[question]?.[state.lang] ||
      state.edits?.[pageId]?.[state.lang]?.key || page[state.lang].key;
    if (!content) continue;
    row(pageId, question ? question + ' · ' + page[state.lang].title : page[state.lang].title,
      {text:content,lang:state.lang,sourceKey:question || 'takeaway',
        ...(question ? {} : {translations:{zh:page.zh.key,en:page.en.key}})});
  }
  for (const h of state.highlights) row(h.page,h.quote,{text:h.quote,lang:h.lang,highlight:h.id});
  if (!list.childElementCount) list.textContent = t('reviewEmpty');
  $('collectReview').onclick = () => {
    for (const {control,text,pageId,lang,highlight,sourceKey,translations} of selected) {
      if (control.checked) addEntry(text,pageId,lang,highlight,{sourceKey,translations});
    }
    reviewSelected.clear();
    renderReview();
  };
  list.scrollTop = scroll;
  update();
}
$('openReview').onclick = () => { renderReview(); $('reviewDialog').showModal(); };
$('closeReview').onclick = () => $('reviewDialog').close();
$('reviewPage').onclick = () => { setReview(d().id,!(state.review || []).includes(d().id)); reviewPageLabel(); };
$('showPaper').onclick = () => {
  const paper = document.querySelector('.paper.overfull') || $('front');
  paper.parentElement.scrollIntoView({block:'start'});
};

$('closeDirectory').onclick = () => {
  $('shell').classList.remove('menuopen');
  $('menu').focus({preventScroll:true});
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('shell').classList.contains('menuopen') && !$('reviewDialog').open) $('closeDirectory').click();
});
document.addEventListener('pointerdown', event => {
  if (matchMedia('(max-width: 760px)').matches && $('shell').classList.contains('menuopen') &&
      !event.target.closest('.rail, #menu')) $('closeDirectory').click();
});
