const EDIT_FIELDS = {
  title: ['标题', 'Title'], idea: ['核心概念', 'Core idea'],
  body: ['本页讲解', 'Explanation'], key: ['关键要点', 'Key takeaway'],
  question: ['自测问题', 'Practice question'], answer: ['自测解析', 'Practice explanation']
};

{
  const tr = (zh,en) => state.lang === 'en' ? en : zh;
  const editor = $('pageEditor');
  const editPage = $('editPage');
  let editTarget, editOpener;
  function openEditor(target = d(), lang = state.lang) {
    editTarget = {target, lang};
    editOpener = document.activeElement;
    $('editHeading').textContent = tr('编辑本页讲解', 'Edit page explanation');
    $('editSource').textContent = target.label + ' · ' + target.num + ' · ' + lang.toUpperCase();
    $('editFields').replaceChildren();
    for (const [field, labels] of Object.entries(EDIT_FIELDS)) {
      const label = document.createElement('label');
      label.textContent = labels[lang === 'en' ? 1 : 0];
      const input = document.createElement(field === 'title' ? 'input' : 'textarea');
      input.name = field;
      input.maxLength = 30000;
      input.rows = field === 'body' ? 9 : 2;
      input.value = state.edits?.[target.id]?.[lang]?.[field] ?? target[lang][field];
      label.append(input);
      $('editFields').append(label);
    }
    editor.showModal();
    $('editFields').scrollTop = 0;
  }

  $('editForm').onsubmit = event => {
    event.preventDefault();
    const {target, lang} = editTarget;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (Object.values(values).some(value => value.length > 30000)) {
      $('editSource').textContent = tr('单个字段最多 30,000 字符。', 'Each field allows up to 30,000 characters.');
      return;
    }
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => target[lang][key] !== value));
    state.edits ??= {};
    state.edits[target.id] ??= {};
    if (Object.keys(changes).length) state.edits[target.id][lang] = changes;
    else delete state.edits[target.id][lang];
    const saved = persist();
    editor.close();
    render();
    if (saved) toast(tr('已保存本页修改', 'Page changes saved'));
  };
  $('resetEdit').onclick = () => {
    for (const field of Object.keys(EDIT_FIELDS)) {
      $('editForm').elements[field].value = editTarget.target[editTarget.lang][field];
    }
  };
  $('closeEditor').onclick = $('cancelEdit').onclick = () => editor.close();
  editor.addEventListener('close', () => {
    const trigger = editOpener === editPage && !editPage.getClientRects().length
      ? $('moreMenu').querySelector('summary') : editOpener;
    trigger?.focus({preventScroll: true});
  });
  editPage.onclick = () => openEditor();

}
