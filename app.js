const byId = id => document.getElementById(id);
const heading = byId('heading');
const content = byId('content');
const filters = ['search', 'species', 'type', 'status'].map(byId);
const zone = 'America/Denver';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date());
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
let month = new Date(today.slice(0, 7) + '-01T00:00:00Z');
let mode = matchMedia('(max-width: 660px)').matches ? 'Agenda' : 'Month';
let data;

function element(tag, value, attributes = {}) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  for (const [name, attribute] of Object.entries(attributes)) node.setAttribute(name, attribute);
  return node;
}

function link(label, href) {
  return element('a', label, { href });
}

function formatDate(value) {
  return dateFormat.format(new Date(value + 'T00:00:00Z'));
}

function eventDate(event) {
  const start = formatDate(event.start);
  const range = event.end && event.end !== event.start ? ' – ' + formatDate(event.end) : '';
  const time = event.startsAt ? new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(event.startsAt)) : '';
  return start + (time ? ' at ' + time : '') + range;
}

function eventsFor(opportunity) {
  return data.events.filter(event => event.opportunityId === opportunity.id);
}

function statusOf(opportunity) {
  const { availableFrom, availableThrough } = opportunity;
  if (opportunity.type === 'Year-round') return 'Year-round';
  if (!availableThrough) {
    const sale = eventsFor(opportunity).find(event => event.label === 'Permit sale opens');
    return sale && (sale.startsAt ? Date.now() < Date.parse(sale.startsAt) : today < sale.start)
      ? 'Upcoming' : 'Check availability';
  }
  if (today === availableFrom || today === availableThrough) {
    const events = eventsFor(opportunity);
    const opens = events.find(event => event.label === 'Applications open');
    const closes = events.find(event => event.label === 'Application deadline');
    if (opens?.startsAt && Date.now() < Date.parse(opens.startsAt)) return 'Upcoming';
    if (closes?.startsAt && Date.now() >= Date.parse(closes.startsAt)) return 'Closed';
  }
  if (today < availableFrom) return 'Upcoming';
  if (today > availableThrough) return 'Closed';
  return 'Open';
}

function filtered() {
  const [query, species, type, status] = filters.map(control => control.value);
  return data.opportunities.filter(item =>
    (!query || (item.title + ' ' + item.unit).toLowerCase().includes(query.trim().toLowerCase())) &&
    (!species || species === item.species) &&
    (!type || type === item.type) &&
    (!status || status === statusOf(item))
  );
}

function calendarExport(event, opportunity) {
  const escapeText = value => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n')
    .replaceAll(',', '\\,').replaceAll(';', '\\;');
  const stamp = value => new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Utah Hunting Calendar//EN',
    'BEGIN:VEVENT', 'UID:' + event.id + '@utah-hunting-calendar',
    'DTSTAMP:' + stamp(new Date()),
    'SUMMARY:' + escapeText(opportunity.title + ' · ' + event.label),
    'URL:' + (event.sourceUrl || opportunity.sourceUrl)
  ];
  if (event.startsAt) {
    lines.push('DTSTART:' + stamp(event.startsAt));
  } else {
    const end = new Date((event.end || event.start) + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push('DTSTART;VALUE=DATE:' + event.start.replaceAll('-', ''),
      'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''));
  }
  lines.push('END:VEVENT', 'END:VCALENDAR', '');
  const encoder = new TextEncoder();
  const folded = lines.map(line => {
    let result = '';
    let bytes = 0;
    for (const character of line) {
      const length = encoder.encode(character).length;
      if (bytes + length > 75) {
        result += '\r\n ';
        bytes = 1;
      }
      result += character;
      bytes += length;
    }
    return result;
  });
  const url = URL.createObjectURL(new Blob([folded.join('\r\n')], { type: 'text/calendar' }));
  const download = link('Download calendar event', url);
  download.download = event.id + '.ics';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function eventList(events, showExport = false) {
  if (!events.length) return element('p', 'No matching events.');
  const list = element('ul', '', { class: 'cards' });
  for (const event of events) {
    const item = element('li');
    const opportunity = data.opportunities.find(record => record.id === event.opportunityId);
    item.append(link(opportunity.title, '#hunt/' + opportunity.id),
      element('p', event.label + ' · ' + eventDate(event)));
    if (showExport) {
      const exportButton = element('button', 'Download calendar event',
        { 'aria-label': 'Download ' + event.label + ' calendar event' });
      exportButton.onclick = () => calendarExport(event, opportunity);
      item.append(exportButton);
    }
    list.append(item);
  }
  return list;
}

function calendar() {
  const monthKey = month.toISOString().slice(0, 7);
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const last = new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10);
  const first = monthKey + '-01';
  const ids = new Set(filtered().map(item => item.id));
  const events = data.events.filter(event =>
    ids.has(event.opportunityId) && event.start <= last && (event.end || event.start) >= first);
  const bar = element('div', '', { class: 'toolbar' });
  const controls = element('div', '', { class: 'toolbar' });
  const actions = [
    ['Previous', () => { month = new Date(Date.UTC(year, index - 1)); }],
    ['Today', () => { month = new Date(today.slice(0, 7) + '-01T00:00:00Z'); }],
    ['Next', () => { month = new Date(Date.UTC(year, index + 1)); }],
    ['Month', () => { mode = 'Month'; }],
    ['Agenda', () => { mode = 'Agenda'; }]
  ];
  for (const [label, action] of actions) {
    const button = element('button', label, { id: 'calendar-' + label });
    if (label === 'Month' || label === 'Agenda') button.setAttribute('aria-pressed', String(mode === label));
    button.onclick = () => { action(); render(); byId(button.id).focus(); };
    controls.append(button);
  }
  bar.append(element('h2', monthFormat.format(month)), controls);
  content.append(bar);
  if (mode === 'Agenda') {
    content.append(eventList(events));
    return;
  }
  const scroll = element('div', '', { class: 'calendar-scroll', tabindex: '0', 'aria-label': 'Month grid' });
  const table = element('table', '', { 'aria-label': monthFormat.format(month) });
  const header = table.createTHead().insertRow();
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    header.append(element('th', day, { scope: 'col' }));
  }
  const body = table.createTBody();
  const offset = month.getUTCDay();
  const days = Number(last.slice(-2));
  for (let slot = 0; slot < Math.ceil((offset + days) / 7) * 7; slot++) {
    if (slot % 7 === 0) body.insertRow();
    const cell = body.rows[body.rows.length - 1].insertCell();
    const day = slot - offset + 1;
    if (day < 1 || day > days) continue;
    const key = monthKey + '-' + String(day).padStart(2, '0');
    const date = element('time', String(day), { datetime: key });
    if (key === today) date.setAttribute('aria-current', 'date');
    cell.append(date);
    for (const event of events.filter(record => record.start <= key && (record.end || record.start) >= key)) {
      const opportunity = data.opportunities.find(item => item.id === event.opportunityId);
      cell.append(link(opportunity.title + ' · ' + event.label, '#hunt/' + opportunity.id));
    }
  }
  scroll.append(table);
  content.append(scroll);
  if (!events.length) content.append(element('p', 'No matching events this month.'));
}

function opportunityList(items) {
  if (!items.length) return element('p', 'No matching opportunities.');
  const list = element('ul', '', { class: 'cards' });
  for (const item of items) {
    const row = element('li');
    row.append(link(item.title, '#hunt/' + item.id),
      element('p', [item.species, item.type, statusOf(item)].join(' · ')));
    list.append(row);
  }
  return list;
}

function detail(id) {
  const item = data.opportunities.find(record => record.id === id);
  content.append(link('All opportunities', '#opportunities'));
  if (!item) {
    heading.textContent = 'Opportunity unavailable';
    return;
  }
  heading.textContent = item.title;
  const panel = element('section', '', { class: 'detail' });
  const facts = element('dl');
  for (const [label, value] of Object.entries({
    Species: item.species, Year: String(item.year), Area: item.unit,
    'Permit type': item.type, Status: statusOf(item)
  })) {
    facts.append(element('dt', label), element('dd', value));
  }
  panel.append(facts);
  if (item.note) panel.append(element('p', item.note));
  if (item.verifiedOn) panel.append(element('p', 'Source reviewed ' + formatDate(item.verifiedOn)));
  panel.append(link('Official dates and regulations', item.sourceUrl));
  if (item.actionUrl) {
    const action = item.type === 'Draw' || item.type === 'Points only'
      ? 'Apply or check results' : 'Check permit availability or buy';
    const row = element('p');
    row.append(link(action, item.actionUrl));
    panel.append(row);
  }
  const events = eventsFor(item);
  if (events.length) panel.append(element('h2', 'Calendar events'), eventList(events, true));
  content.append(panel);
}

function render() {
  if (!data) return;
  const route = location.hash.slice(1) || 'home';
  for (const anchor of document.querySelectorAll('nav a')) {
    if (anchor.hash === '#' + route) anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  }
  byId('filters').hidden = !['calendar', 'opportunities'].includes(route);
  content.replaceChildren();
  if (route === 'calendar') {
    heading.textContent = 'Calendar';
    calendar();
  } else if (route === 'opportunities') {
    heading.textContent = 'Opportunities';
    content.append(opportunityList(filtered()));
  } else if (route.startsWith('hunt/')) {
    detail(route.slice(5));
  } else {
    heading.textContent = 'Plan your Utah hunting year';
    content.append(element('h2', 'Open now'),
      opportunityList(data.opportunities.filter(item => statusOf(item) === 'Open')),
      element('h2', 'Coming up'),
      eventList(data.events.filter(event => event.start >= today).slice(0, 6)),
      link('View full calendar', '#calendar'));
  }
}

try {
  const response = await fetch('./opportunities.json');
  if (!response.ok) throw new Error('Fixture unavailable');
  data = await response.json();
  data.events.sort((left, right) => left.start.localeCompare(right.start));
  for (const field of ['species', 'type']) {
    const values = new Set(data.opportunities.map(item => item[field]));
    for (const value of [...values].sort()) byId(field).append(element('option', value, { value }));
  }
  filters.forEach(control => control.addEventListener('input', render));
  window.addEventListener('hashchange', () => { render(); heading.focus(); });
  render();
} catch (error) {
  content.textContent = 'The calendar data could not be loaded. Refresh the page to try again.';
  console.error(error);
}
