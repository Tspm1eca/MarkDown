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

  const CHECK_ICON = '<svg class="checkmark-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 L9 17 L20 6"/></svg>';
  const X_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 L6 18"/><path d="M6 6 L18 18"/></svg>';
  const SPINNER_ICON = '<svg class="spinner-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"/></svg>';

  let lastResult = null;

  function updateTokenCount() {
    if (!lastResult?.content) return;
    const tokens = GPTTokenizer_o200k_base.encode(lastResult.content).length;
    tokenCount.textContent = tokens.toLocaleString() + ' GPT tokens';
  }

  function setStatus(html, cls) {
    statusBadge.innerHTML = html;
    statusBadge.className = 'badge' + (cls ? ' ' + cls : '');
  }

  function flashCheckmark() {
    statusBadge.innerHTML = CHECK_ICON;
    statusBadge.className = 'badge success copying';
    setTimeout(() => statusBadge.classList.remove('copying'), 400);
  }

  function showError(msg) {
    error.textContent = msg;
    error.classList.remove('hidden');
    setStatus(X_ICON, 'error');
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
    setStatus(SPINNER_ICON);
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
    setStatus(CHECK_ICON, 'success');
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
    } catch {
      output.select();
      document.execCommand('copy');
    }
    flashCheckmark();
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
    setStatus(CHECK_ICON, 'success');
  });

  // Auto-extract on open
  extract();
});
