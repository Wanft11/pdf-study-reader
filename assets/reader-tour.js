{
 const dialog = $('readerTour');
 const localized = (zh, en) => state.lang === 'zh' ? zh : en;
 let steps = [];
 let index = 0;
 const label = () => { $('openTour').textContent = localized('使用引导', 'Quick tour'); };
 label();
 $('lang').addEventListener('click', label);

 function showStep() {
  const [titleZh, titleEn, bodyZh, bodyEn] = steps[index];
  $('tourTitle').textContent = localized(titleZh, titleEn);
  $('tourProgress').textContent = localized('步骤', 'Step') + ' ' + (index + 1) + ' / ' + steps.length;
  $('tourBody').textContent = localized(bodyZh, bodyEn);
  $('tourSkip').textContent = localized('跳过', 'Skip');
  $('tourBack').textContent = localized('上一步', 'Back');
  $('tourBack').disabled = index === 0;
  $('tourNext').textContent = index === steps.length - 1
   ? localized('完成', 'Done') : localized('下一步', 'Next');
 }
 function openTour() {
  steps = [
   ['找课件页', 'Find a page', '在左侧目录搜索关键词或页码。也可输入原 PDF 页码跳转，或用方向键翻页。', 'Search the directory by keyword or page number. Enter an original PDF page number to jump, or use the arrow keys to turn pages.'],
   ['高亮和笔记', 'Highlights and notes', '选中文字后点击高亮。扫描页没有可选原文时，可以写笔记。笔记保存在当前浏览器。', 'Select text to highlight it. For scanned pages without selectable text, use the notes field. Notes stay in this browser.'],
   ['做一张双面 A4', 'Make an A4 cheat sheet', '选中文字并加入速查表，或从工具栏打开速查表添加条目。可以选择正反面、调整顺序并打印。', 'Select text to add an excerpt, or open the cheat sheet from the toolbar to add an entry. Choose a side, reorder entries, and print.']
  ];
  if (CONFIG.languages.length > 1) steps.push(
   ['切换语言', 'Switch languages', '点工具栏上的语言按钮，在中文和英文之间切换。', 'Use the language button in the toolbar to switch between Chinese and English.']);
  if (CONFIG.aiHandoff) steps.push(
   ['问当前页', 'Ask about this page', '点击「AI 提问」，把问题和当前页内容复制到自己的 AI 对话。无需启动器或 API Key。', 'Click Ask AI and copy your question and page context into your own AI chat. The reader needs no launcher or API key.']);
  index = 0;
  showStep();
  dialog.showModal();
 }
 $('openTour').onclick = openTour;
 $('tourBack').onclick = () => { index -= 1; showStep(); };
 $('tourNext').onclick = () => {
  if (index === steps.length - 1) finishTour();
  else { index += 1; showStep(); }
 };
 function finishTour() {
  if (!state.tourSeen) {
   state.tourSeen = true;
   persist();
  }
  dialog.close();
 }
 $('tourSkip').onclick = finishTour;
 dialog.addEventListener('cancel', event => {
  event.preventDefault();
  finishTour();
 });
 dialog.addEventListener('close', () => {
  if ($('moreMenu').open) $('openTour').focus();
  else $('moreMenu').querySelector('summary').focus();
 });
 if (!CONFIG.preview && !state.tourSeen) openTour();
}
