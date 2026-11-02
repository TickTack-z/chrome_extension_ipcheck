const button = document.getElementById('refresh');
function render(state, previous) {
  if (!state) return;
  const status = document.getElementById('status');
  status.textContent = state.label; status.style.color = state.color;
  const container = document.getElementById('rows'); container.replaceChildren();
  for (const row of state.rows) {
    const card = document.createElement('div'); card.className = 'row';
    for (const [value, cls] of [[row.name,'name'], [row.error || row.ip,row.error ? 'error' : 'ip'], [row.error ? '' : row.location,'location']]) {
      const line = document.createElement('div'); line.className = cls; line.textContent = value; card.append(line);
    }
    container.append(card);
  }
  document.getElementById('time').textContent = '本次检测：' + new Date(state.checkedAt).toLocaleString();
  document.getElementById('previous').textContent = state.rows.some(r => r.error) && previous ? '上次完整成功：' + new Date(previous.checkedAt).toLocaleString() + ' · ' + previous.label + ' · 谷歌出口 ' + previous.rows[2].ip + ' ' + previous.rows[2].location : '';
}
async function refresh() {
  button.disabled = true; button.textContent = '检测中…';
  try {
    const result = await chrome.runtime.sendMessage({type:'refresh'});
    if (result?.error) throw new Error(result.error);
    const {lastSuccess} = await chrome.storage.local.get('lastSuccess'); render(result.state, lastSuccess);
  } catch (e) {document.getElementById('status').textContent = '刷新失败：' + e.message;}
  finally {button.disabled = false; button.textContent = '刷新';}
}
button.addEventListener('click', refresh);
chrome.storage.local.get(['state','lastSuccess']).then(({state,lastSuccess}) => {render(state,lastSuccess); if (!state) refresh();});
