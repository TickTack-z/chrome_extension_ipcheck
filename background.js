const SOURCES = [
  {key:'domestic', name:'国内测试', url:'https://ip111.cn/'},
  {key:'foreign', name:'国外测试', url:'https://us.ip111.cn/ip.php'},
  {key:'google', name:'谷歌测试', url:'https://sspanel.net/ip.php'}
];
const COUNTRIES = [['中国香港','港'],['中国澳门','澳'],['中国台湾','台'],['香港','港'],['澳门','澳'],['台湾','台'],['美国','美'],['韩国','韩'],['日本','日'],['新加坡','新'],['英国','英'],['德国','德'],['法国','法'],['加拿大','加'],['澳大利亚','澳洲'],['荷兰','荷'],['俄罗斯','俄'],['印度','印'],['中国','中']];
function parseResult(html, key) {
  if (key === 'domestic') {
    const section = html.split('从国内测试')[1];
    if (!section) throw new Error('页面格式变化：找不到国内测试');
    html = section.split('这是您访问国内网站所使用的IP')[0];
  }
  const text = html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
  const match = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  const v6 = match ? null : text.match(/(?:[a-fA-F0-9]{0,4}:){2,}[a-fA-F0-9:.]*/);
  const ip = match?.[0] || v6?.[0];
  if (!ip || (match && ip.split('.').some(x => +x > 255))) throw new Error('响应中未找到有效 IP');
  const location = text.slice(text.indexOf(ip) + ip.length).trim();
  const country = COUNTRIES.find(([name]) => location.includes(name));
  if (!country) throw new Error('无法识别国家/地区：' + location.slice(0,70));
  return {ip, location:location.slice(0,150), country:country[1], mainland:country[1] === '中'};
}
function classify(rows) {
  if (rows.some(r => r.error)) return {label:'检测失败', color:'#d97706', badge:'?'};
  const [d,f,g] = rows;
  if (rows.every(r => r.mainland)) return {label:'全国内 IP', color:'#64748b', badge:'中'};
  if (d.mainland && !g.mainland) return {label:'国内外分流', color:'#15803d', badge:g.country};
  if (rows.every(r => !r.mainland)) return {label:'全国外 IP', color:'#2563eb', badge:g.country};
  return {label:'其他分流组合', color:'#d97706', badge:'?'};
}
async function ensureRequestHeaders() {
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[111], addRules:[{
    id:111, priority:1,
    action:{type:'modifyHeaders', requestHeaders:[{header:'Referer', operation:'set', value:'https://ip111.cn/'}]},
    condition:{initiatorDomains:[chrome.runtime.id], requestDomains:['us.ip111.cn','sspanel.net'], resourceTypes:['xmlhttprequest']}
  }]});
}
let running;
async function refresh() {
  if (running) return running;
  running = (async () => {
    await ensureRequestHeaders();
    const rows = await Promise.all(SOURCES.map(async source => {
      try {
        const response = await fetch(source.url, {cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(12000)});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return {...source, ...parseResult(await response.text(), source.key)};
      } catch (e) { return {...source, error:e.name === 'TimeoutError' ? '请求超时（12秒）' : e.message}; }
    }));
    const state = {...classify(rows), rows, checkedAt:Date.now()};
    await chrome.storage.local.set({state, ...(!rows.some(r => r.error) ? {lastSuccess:state} : {})});
    await chrome.action.setBadgeText({text:state.badge});
    await chrome.action.setBadgeBackgroundColor({color:state.color});
    await chrome.action.setBadgeTextColor({color:'#ffffff'});
    await chrome.action.setTitle({title:state.label + '\n' + rows.map(r => r.name + '：' + (r.error || r.ip + ' ' + r.location)).join('\n') + '\n检测时间：' + new Date(state.checkedAt).toLocaleString()});
    return state;
  })().finally(() => {running = null;});
  return running;
}
async function ensureAlarm() {
  if (!await chrome.alarms.get('ip111-refresh')) await chrome.alarms.create('ip111-refresh', {periodInMinutes:15});
}
chrome.runtime.onInstalled.addListener(() => {ensureAlarm(); refresh();});
chrome.runtime.onStartup.addListener(() => {ensureAlarm(); refresh();});
chrome.alarms.onAlarm.addListener(alarm => {if (alarm.name === 'ip111-refresh') refresh();});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === 'refresh') {refresh().then(state => reply({state}), e => reply({error:e.message})); return true;}
});
ensureAlarm();
