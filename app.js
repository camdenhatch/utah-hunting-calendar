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
let updateStatus = '';
const feedUrl = document.querySelector('meta[name="updates-feed"]').content;

function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['wildlife.utah.gov', 'hunt.utah.gov', 'utahdraws.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function mergeUpdates(feed) {
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value));
  if (feed.version !== 1 || !Array.isArray(feed.opportunities) ||
      !Array.isArray(feed.events) || !Array.isArray(feed.sources)) throw new Error('Invalid update feed');
  const opportunities = new Map(data.opportunities.map(item => [item.id, item]));
  for (const record of feed.opportunities) {
    const item = { ...opportunities.get(record.id), ...record };
    if ([item.id, item.title, item.species, item.unit, item.type].every(value => typeof value === 'string' && value) &&
        Number.isInteger(item.year) && officialUrl(item.sourceUrl) &&
        (!item.actionUrl || officialUrl(item.actionUrl))) opportunities.set(item.id, item);
  }
  const events = new Map(data.events.map(item => [item.id, item]));
  for (const record of feed.events) {
    const event = { ...events.get(record.id), ...record };
    if (typeof event.id === 'string' && typeof event.label === 'string' && date(event.start) &&
        (!event.end || (date(event.end) && event.end >= event.start)) &&
        (!event.startsAt || Number.isFinite(Date.parse(event.startsAt))) &&
        opportunities.has(event.opportunityId) && officialUrl(event.sourceUrl)) events.set(event.id, event);
  }
  data.opportunities = [...opportunities.values()];
  data.events = [...events.values()].sort((a, b) => a.start.localeCompare(b.start));
  const priority = feed.sources.find(source => source.id === 'permits');
  const checked = Date.parse(priority?.checkedAt);
  const timestamp = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, dateStyle: 'medium', timeStyle: 'short'
  });
  const checkedText = Number.isFinite(checked)
    ? 'Permit listing last checked ' + timestamp.format(new Date(checked)) + ' Utah time.'
    : 'Permit listing check pending.';
  const stale = feed.sources.some(source => source.error ||
    Date.now() - Date.parse(source.checkedAt || '') > (source.id === 'permits' ? 2 : 26) * 3600000);
  updateStatus = checkedText + (stale ? ' A source check is delayed. Showing the last verified data.' : '');
}

async function loadUpdates() {
  try {
    const response = await fetch(feedUrl, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Update feed unavailable');
    mergeUpdates(await response.json());
    populateFilters();
  } catch (error) {
    console.error(error);
    updateStatus = 'Live updates unavailable. Showing the published calendar.';
  }
  // Preserve in-progress draw-planner fields and announce updates on calendar views.
  if (location.hash !== '#planner') render();
}

function populateFilters() {
  for (const field of ['species', 'type']) {
    const control = byId(field);
    const selected = control.value;
    const values = new Set(data.opportunities.map(item => item[field]));
    control.length = 1;
    for (const value of [...values].sort()) control.append(element('option', value, { value }));
    control.value = values.has(selected) ? selected : '';
  }
}

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
  if (updateStatus && route !== 'planner') content.append(element('p', updateStatus, { class: 'notice' }));
  if (route === 'planner') {
    heading.textContent = 'Draw planner';
    planner();
  } else if (route === 'calendar') {
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

const programs = [
  ['deer-general', 'General-season buck deer', 'Deer', 'preference', '2026-big-deer'],
  ['deer-limited', 'Limited-entry buck deer', 'Deer', 'bonus', '2026-big-deer'],
  ['elk-limited', 'Limited-entry bull elk', 'Elk', 'bonus', '2026-big-elk'],
  ['elk-antlerless', 'Antlerless elk', 'Elk', 'preference', '2026-ant-elk'],
  ['deer-antlerless', 'Antlerless deer', 'Deer', 'preference', '2026-ant-deer'],
  ['pronghorn', 'Buck pronghorn', 'Pronghorn', 'bonus', '2026-big-pronghorn'],
  ['pronghorn-antlerless', 'Doe pronghorn', 'Pronghorn', 'preference', '2026-ant-pronghorn'],
  ['moose', 'Bull moose', 'Moose', 'bonus', '2026-big-moose'],
  ['moose-antlerless', 'Antlerless moose', 'Moose', 'bonus', '2026-ant-moose'],
  ['goat', 'Mountain goat', 'Mountain goat', 'bonus', '2026-big-goat'],
  ['rocky-sheep', 'Rocky Mountain bighorn sheep', 'Bighorn sheep', 'bonus', '2026-big-rocky-sheep'],
  ['desert-sheep', 'Desert bighorn sheep', 'Bighorn sheep', 'bonus', '2026-big-desert-sheep'],
  ['ewe', 'Ewe bighorn sheep', 'Bighorn sheep', 'bonus', '2026-ant-sheep'],
  ['turkey', 'Spring limited-entry turkey', 'Turkey', 'bonus', '2027-turkey-draw']
];
const profileKey = 'utah-hunting-calendar-draw-points-v1';
let odds;

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(profileKey)) || {};
  } catch {
    return {};
  }
}

function planner() {
  const profile = readProfile();
  const controls = element('div', '', { class: 'planner-controls' });
  const program = element('select');
  for (const [id, name] of programs) program.append(element('option', name, { value: id }));
  const residency = element('select');
  for (const name of ['Resident', 'Nonresident']) residency.append(element('option', name));
  const points = element('input', '', { type: 'number', min: '0', max: '99', step: '1' });
  const year = element('select');
  year.append(element('option', 'All loaded years', { value: '' }));
  for (const value of [...new Set((odds || []).map(row => row.year))].sort().reverse()) {
    year.append(element('option', String(value)));
  }
  for (const [label, control] of [['Draw program', program], ['Residency', residency],
    ['Points', points], ['Report year', year]]) {
    const field = element('label', label);
    field.append(control);
    controls.append(field);
  }
  const result = element('div', '', { 'aria-live': 'polite' });
  const persistence = element('p', 'Points are saved in this browser.');
  program.value = programs.some(([id]) => id === profile.program) ? profile.program : programs[0][0];
  residency.value = profile.residency === 'Nonresident' ? 'Nonresident' : 'Resident';
  function key() { return program.value + '/' + residency.value; }
  function refreshPoints() {
    const selected = programs.find(([id]) => id === program.value);
    points.parentElement.firstChild.textContent = selected[3] === 'bonus' ? 'Bonus points' : 'Preference points';
    points.value = profile[key()] ?? '';
  }
  function save() {
    profile.program = program.value;
    profile.residency = residency.value;
    try {
      localStorage.setItem(profileKey, JSON.stringify(profile));
    } catch {
      persistence.textContent = 'Browser storage is unavailable. Points will reset when this page is reopened.';
    }
  }
  function showResults() {
    result.replaceChildren(element('h2', 'Historical first-choice results'));
    const [, , species, , calendarId] = programs.find(([id]) => id === program.value);
    if (data.opportunities.some(item => item.id === calendarId)) {
      result.append(link('View application dates and official links', '#hunt/' + calendarId));
    }
    const rows = (odds || []).filter(row => row.program === program.value &&
      row.residency === residency.value && row.points === points.valueAsNumber &&
      (!year.value || row.year === Number(year.value)));
    rows.sort((left, right) => right.year - left.year ||
      (right.issued / (right.applicants || 1)) - (left.issued / (left.applicants || 1)));
    if (!odds) result.append(element('p', odds === null ? 'The historical dataset could not be loaded.' : 'Loading historical results…'));
    else if (!points.value) result.append(element('p', 'Enter your points to compare the matching historical group.'));
    else if (!points.validity.valid) result.append(element('p', 'Enter a whole number from 0 to 99.'));
    else if (!rows.length) result.append(element('p', 'No loaded report row matches this selection.'));
    else {
      const list = element('ul', '', { class: 'cards' });
      for (const row of rows) {
        const item = element('li');
        const rate = row.applicants ? (row.issued / row.applicants * 100).toFixed(1) + '%' : 'No eligible applicants';
        item.append(element('strong', row.hunt + ' · ' + row.code),
          element('p', row.year + ' · ' + row.pool + ' · ' + rate + ' · ' +
            row.issued.toLocaleString() + ' permits / ' + row.applicants.toLocaleString() + ' eligible applicants'),
          link('Official DWR report', row.source));
        list.append(item);
      }
      result.append(list);
    }
    result.append(element('p', 'Historical success rates describe those applicants and years. Future results depend on quotas and demand.'),
      link('Browse official DWR reports', species === 'Turkey'
        ? 'https://wildlife.utah.gov/odds' : 'https://wildlife.utah.gov/biggame/odds'),
      element('h2', 'Options without a draw'));
    const alternatives = data.opportunities.filter(item => item.species === species &&
      ['General sale', 'Leftover sale'].includes(item.type) && item.actionUrl);
    if (!alternatives.length) {
      result.append(element('p', 'No same-species purchase option is listed in the calendar.'),
        link('Check DWR’s remaining permits page', 'https://wildlife.utah.gov/remainingpermits'));
      return;
    }
    const list = element('ul', '', { class: 'cards' });
    for (const item of alternatives) {
      const row = element('li');
      const pathway = item.type === 'Leftover sale' ? 'Remaining permits if available' : 'General permit sale';
      const eligibility = item.id === '2026-elk-sale-youth' ? ' · Youth eligibility required' : '';
      row.append(link(item.title, '#hunt/' + item.id),
        element('p', item.year + ' · Same species · ' + pathway + eligibility + ' · Check DWR for inventory'));
      list.append(row);
    }
    result.append(list);
  }
  for (const control of [program, residency]) control.onchange = () => {
    refreshPoints();
    save();
    showResults();
  };
  points.oninput = () => {
    if (points.validity.valid) {
      if (points.value) profile[key()] = points.valueAsNumber;
      else delete profile[key()];
      save();
    }
    showResults();
  };
  year.onchange = showResults;
  refreshPoints();
  content.append(controls, persistence, result);
  showResults();
}

try {
  const response = await fetch('./opportunities.json?v=4');
  if (!response.ok) throw new Error('Fixture unavailable');
  data = await response.json();
  fetch('./draw-history.json?v=4')
    .then(response => {
      if (!response.ok) throw new Error('Historical dataset unavailable');
      return response.json();
    })
    .then(rows => { odds = rows; if (location.hash === '#planner') render(); })
    .catch(error => { odds = null; console.error(error); if (location.hash === '#planner') render(); });
  data.events.sort((left, right) => left.start.localeCompare(right.start));
  populateFilters();
  filters.forEach(control => control.addEventListener('input', render));
  window.addEventListener('hashchange', () => { render(); heading.focus(); });
  render();
  if (feedUrl) loadUpdates();
} catch (error) {
  content.textContent = 'The calendar data could not be loaded. Refresh the page to try again.';
  console.error(error);
}
