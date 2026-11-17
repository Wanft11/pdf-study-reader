/* Markdown is rendered locally. Model output cannot create HTML, links or remote images. */
function formatStudyAnswer(container, text, sourceIds, citationButton) {
  const math = [];
  const citations = [];
  const citationPattern = /\[((?:D[0-9a-f]{10})-\d{3,})(?::(\d{1,3})(?:-(\d{1,3}))?)?\]/;
  const citation = {
    name: 'studyCitation',
    level: 'inline',
    start: text => text.search(citationPattern),
    tokenizer(text) {
      const match = citationPattern.exec(text);
      if (!match || match.index !== 0 || !sourceIds.includes(match[1])) return;
      const [, id, first, last = first] = match;
      const index = citations.push({id, start: Number(first), end: Number(last)}) - 1;
      return {type: 'studyCitation', raw: match[0], index};
    },
    renderer: token => '<span data-study-cite="' + token.index + '"></span>'
  };
  const formula = {
    name: 'studyMath',
    level: 'inline',
    start: text => text.search(/\\[([]|\$\$/),
    tokenizer(text) {
      const match = /^(?:\\\(([^\n]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$)/.exec(text);
      if (!match) return;
      const index = math.push({tex: match[1] ?? match[2] ?? match[3], display: match[1] === undefined}) - 1;
      return {type: 'studyMath', raw: match[0], index};
    },
    renderer: token => '<span data-study-math="' + token.index + '"></span>'
  };
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const parser = new marked.Marked({
    breaks: container.classList.contains('paperText'),
    extensions: [formula, citation],
    useNewRenderer: true,
    renderer: {
      html: ({text}) => escape(text),
      link({tokens}) { return this.parser.parseInline(tokens); },
      image: ({text}) => escape(text)
    }
  });
  container.innerHTML = parser.parse(text);
  for (const node of container.querySelectorAll('[data-study-math]')) {
    const {tex, display} = math[Number(node.dataset.studyMath)];
    node.className = display ? 'studyMathDisplay' : 'studyMathInline';
    try {
      katex.render(tex, node, {displayMode: display, output: 'mathml', trust: false, maxExpand: 200, maxSize: 20});
    } catch {
      node.textContent = tex;
    }
  }
  for (const node of container.querySelectorAll('[data-study-cite]')) {
    node.replaceWith(citationButton(citations[Number(node.dataset.studyCite)]));
  }
}
