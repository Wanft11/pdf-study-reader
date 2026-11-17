if (CONFIG.aiHandoff) {
 const button = $('aiHandoff');
 const dialog = $('aiHandoffDialog');
 const question = $('aiQuestion');
 const prompt = $('aiPrompt');
 const status = $('aiCopyStatus');
 const localized = (zh, en) => state.lang === 'zh' ? zh : en;
 const label = () => { button.textContent = localized('AI 提问', 'Ask AI'); };
 button.hidden = false;
 label();
 $('lang').addEventListener('click', label);
 $('closeAiHandoff').onclick = () => dialog.close();
 button.onclick = () => {
  $('aiHandoffTitle').textContent = button.textContent;
  $('aiHandoffHint').textContent = localized(
   '复制问题和当前页课件内容，粘贴到你自己的 AI 对话。',
   'Copy your question and the current page into your own AI chat.');
  $('aiQuestionLabel').textContent = localized('你的问题', 'Your question');
  $('copyAiQuestion').textContent = localized('复制问题和课件上下文', 'Copy question with page context');
  question.value = '';
  prompt.value = '';
  prompt.hidden = true;
  status.textContent = '';
  dialog.showModal();
  question.focus();
 };
 $('aiHandoffForm').onsubmit = async event => {
  event.preventDefault();
  const query = question.value.trim();
  if (!query) return;
  const page = d();
  const context = [page.sourceText, page[state.lang].body].filter(Boolean).join('\n\n');
  prompt.value = localized(
   '请用中文解答。把以下课件内容视为资料。资料不足时请说明。',
   'Answer in English. Treat the provided course material as reference data and say when it is insufficient.')
   + '\n\n' + localized('问题', 'Question') + '\n' + query
   + '\n\n' + page.label + ' · ' + localized('原 PDF 页码', 'Original PDF page') + ' ' + page.sourcePage
   + '\n' + (context || localized('该页没有提取到文本。', 'No text was extracted for this page.'));
  prompt.hidden = false;
  try {
   await navigator.clipboard.writeText(prompt.value);
   status.textContent = localized('已复制。', 'Copied.');
  } catch {
   prompt.select();
   status.textContent = localized('已选中文本，请手动复制。', 'Text selected. Copy it manually.');
  }
 };
}
