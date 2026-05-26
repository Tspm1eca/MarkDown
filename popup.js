document.addEventListener('DOMContentLoaded', () => {
  const extractBtn = document.getElementById('extractBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const metaInfo = document.getElementById('metaInfo');
  const tokenCount = document.getElementById('tokenCount');
  const charCount = document.getElementById('charCount');
  const output = document.getElementById('output');
  const statusBadge = document.getElementById('status');

  let lastResult = null;

  function updateTokenCount() {
    if (!lastResult?.content) return;
    const tokens = GPTTokenizer_o200k_base.encode(lastResult.content).length;
    tokenCount.textContent = tokens.toLocaleString() + ' GPT tokens';
  }

  function setStatus(text, cls) {
    statusBadge.textContent = text;
    statusBadge.className = 'badge' + (cls ? ' ' + cls : '');
  }

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove('hidden');
    setStatus('Error', 'error');
  }

  function hideError() {
    error.classList.add('hidden');
  }

  function showLoading() {
    loading.classList.remove('hidden');
    output.classList.add('hidden');
    metaInfo.classList.add('hidden');
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    hideError();
    setStatus('Extracting...');
  }

  function showResult(result) {
    loading.classList.add('hidden');
    if (!result || !result.content) {
      showError(result?.error?.message || 'No content extracted');
      return;
    }
    lastResult = result;
    output.value = result.content;
    output.classList.remove('hidden');
    metaInfo.classList.remove('hidden');
    charCount.textContent = result.content.length.toLocaleString() + ' chars';
    updateTokenCount();
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    setStatus('Done', 'success');
  }

  async function extract() {
    showLoading();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showError('Cannot access current tab');
        return;
      }
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_MARKDOWN' });
      showResult(response);
    } catch (err) {
      showError('Failed to extract: ' + (err.message || 'Unknown error'));
    }
  }

  extractBtn.addEventListener('click', extract);

  copyBtn.addEventListener('click', async () => {
    if (!lastResult?.content) return;
    try {
      await navigator.clipboard.writeText(lastResult.content);
      setStatus('Copied!', 'success');
      setTimeout(() => setStatus('Done', 'success'), 1500);
    } catch {
      output.select();
      document.execCommand('copy');
      setStatus('Copied!', 'success');
      setTimeout(() => setStatus('Done', 'success'), 1500);
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (!lastResult?.content) return;
    const filename = (lastResult.title || 'page').replace(/[\\/:*?"<>|]/g, '_') + '.md';
    const blob = new Blob([lastResult.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded', 'success');
  });

  // Auto-extract on open
  extract();
});
