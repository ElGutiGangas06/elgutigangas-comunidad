'use strict';
(() => {
  const page = document.body.dataset.page;
  const $ = selector => document.querySelector(selector);
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  async function readData(name) {
    const response = await fetch(`data/${name}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`No se pudo leer ${name}.json`);
    return response.json();
  }
  function safeLocalPath(path) {
    if (typeof path !== 'string' || !path || /^(?:[a-z]+:|\/\/)/i.test(path) || path.startsWith('/') || path.includes('..')) return '';
    return path;
  }
  function image(path, alt, width, height = width) {
    const node = make('img');
    node.src = safeLocalPath(path);
    node.alt = alt;
    node.width = width;
    node.height = height;
    node.loading = 'lazy';
    node.decoding = 'async';
    return node;
  }
  function notice(container, title, message, retry) {
    container.replaceChildren();
    const box = make('div', 'error-state');
    box.append(make('h3', '', title), make('p', '', message));
    if (retry) {
      const button = make('button', 'button secondary', 'Volver a cargar');
      button.type = 'button';
      button.addEventListener('click', retry);
      box.append(button);
    }
    container.append(box);
  }
  function categoryFilters(container, categories, onChange) {
    container.replaceChildren();
    ['Todas', ...categories].forEach((category, i) => {
      const button = make('button', 'chip', category);
      button.type = 'button';
      button.dataset.category = i ? category : 'all';
      button.setAttribute('aria-pressed', String(!i));
      button.addEventListener('click', () => {
        container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        onChange(button.dataset.category);
      });
      container.append(button);
    });
  }
  function typeName(item) { return item.type === 'animated' ? 'Animado' : 'Estático'; }
  function stillFor(item) { return item.still || (item.type !== 'animated' ? item.preview || item.large : ''); }
  function twitchState(item) {
    const state = item.twitch || {};
    return {
      uploaded: state.uploaded === true,
      assigned: state.assigned === true,
      assignment: state.assignment || '',
      moderation: state.moderation || 'unknown',
      code: state.code || item.code || ''
    };
  }
  function twitchSummary(data, items) {
    if (!data.twitchVerifiedAt) return {
      counts: 'El estado de las ranuras está pendiente de la lectura final.',
      follow: 'Los códigos y sus estados se mostrarán al cerrar la instantánea del panel.',
      snapshot: 'Instantánea de Twitch pendiente de cerrar.'
    };
    const uploaded = items.filter(item => twitchState(item).uploaded).length;
    const assigned = items.filter(item => twitchState(item).assigned).length;
    const followPending = items.filter(item => twitchState(item).assignment === 'follower_pending').length;
    const at = data.twitchVerifiedAt ? new Date(data.twitchVerifiedAt) : null;
    const time = at && !Number.isNaN(at.valueOf()) ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Santiago' }).format(at) : 'lectura final pendiente';
    return {
      counts: `${uploaded} cargados · ${assigned} asignados · ${uploaded - assigned} en biblioteca sin ranura.`,
      follow: followPending ? `${followPending} candidatos para seguidores quedan en biblioteca: Twitch advierte que retirar los anteriores impediría reponerlos sin elegibilidad para carga instantánea. Los cinco anteriores se conservan.` : 'Las ranuras y su estado se reflejan según la última lectura del panel.',
      snapshot: `Instantánea de Twitch: ${time}. ${data.verificationNote ? `${data.verificationNote} ` : ''}La revisión de Twitch y la disponibilidad pueden cambiar.`
    };
  }
  function twitchLabel(item) {
    const state = twitchState(item);
    if (!state.uploaded) return 'Carga por confirmar';
    if (state.assigned) return state.moderation === 'no_pending_label' ? 'Asignado · Sin aviso de revisión' : state.moderation === 'pending' ? 'Asignado · Twitch revisando' : 'Asignado · Estado por confirmar';
    if (state.assignment === 'follower_pending') return 'En biblioteca · Seguidor pendiente';
    return 'En biblioteca · Reserva';
  }
  function slotName(item) {
    return { tier1: 'Suscripción Nivel 1', tier2: 'Suscripción Nivel 2', tier3: 'Suscripción Nivel 3', follower: 'Seguidor', bits1000: 'Bits · 1.000', bits5000: 'Bits · 5.000', bits10000: 'Bits · 10.000' }[twitchState(item).assignment] || '';
  }
  let feedbackTimer;
  async function copyText(text, button) {
    const feedback = $('#copy-feedback');
    const originalLabel = button.textContent;
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {
      const field = make('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.setAttribute('aria-label', 'Texto del comando para copiar');
      field.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(field);
      field.select();
      copied = document.execCommand('copy');
      field.remove();
      button.focus();
    }
    if (feedback) {
      clearTimeout(feedbackTimer);
      feedback.textContent = copied ? `Copiado: ${text}` : 'No se pudo copiar automáticamente. Selecciona el comando y cópialo manualmente.';
      feedbackTimer = setTimeout(() => { feedback.textContent = ''; }, 4000);
    }
    if (copied) {
      button.textContent = 'Copiado';
      button.disabled = true;
      setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 1200);
    }
  }

  async function home() {
    const preview = $('#family-preview');
    try {
      const data = await readData('emotes');
      const items = Array.isArray(data.items) ? data.items : [];
      const animated = items.filter(item => item.type === 'animated');
      const statics = items.length - animated.length;
      $('#family-count').textContent = `${statics} emotes estáticos y ${animated.length} animados aprobados para el canal.`;
      const summary = twitchSummary(data, items);
      $('#twitch-summary').textContent = `${summary.counts} ${summary.snapshot}`;
      $('#home-config-message').textContent = summary.follow;
      const selected = [items.find(item => /cafe/.test(normalize(item.name))), items.find(item => /chad/.test(normalize(item.name))), ...animated.slice(0, 3)].filter(Boolean);
      preview.replaceChildren();
      selected.forEach(item => {
        const fig = make('figure');
        fig.append(image(stillFor(item), `${item.name}, emote de Blanco`, 112), make('figcaption', '', item.name));
        preview.append(fig);
      });
      if (!selected.length) notice(preview, 'La familia está en preparación.', 'Abre la galería para consultar el catálogo disponible.');
    } catch (_) {
      $('#family-count').textContent = 'El catálogo de Blanco no se pudo cargar. Vuelve a intentarlo.';
      notice(preview, 'No se pudo cargar la selección.', 'Puedes volver a cargar la página o abrir la guía de emotes.', home);
    }
  }

  async function emotes() {
    const grid = $('#emote-grid');
    const search = $('#emote-search');
    const motionToggle = $('#motion-toggle');
    const placement = $('#emote-placement');
    const result = $('#emote-results');
    let data;
    try { data = await readData('emotes'); } catch (_) {
      result.textContent = 'La galería no está disponible todavía.';
      notice(grid, 'No se pudo cargar el catálogo.', 'La galería no se pudo cargar. Vuelve a intentarlo.', () => location.reload());
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const summary = twitchSummary(data, items);
    $('#emote-config-summary').textContent = `${summary.counts} ${summary.follow}`;
    $('#emote-snapshot-note').textContent = summary.snapshot;
    let type = 'all';
    let category = 'all';
    let playAll = !reducedMedia.matches;
    const stopped = new Set();
    motionToggle.checked = playAll;
    function motionNote() {
      $('#motion-note').textContent = reducedMedia.matches ? 'Movimiento reducido activo: se muestran poses quietas. Puedes activar los animados si prefieres verlos.' : 'Puedes detenerlos todos o controlar cada pieza por separado.';
    }
    motionNote();
    const wantsMotion = item => item.type === 'animated' && playAll && !stopped.has(item.id);
    function syncMotionToggle() {
      const animated = items.filter(item => item.type === 'animated');
      const playing = animated.filter(wantsMotion).length;
      motionToggle.checked = animated.length > 0 && playing === animated.length;
      motionToggle.indeterminate = playing > 0 && playing < animated.length;
    }
    function chooseSource(item, size) {
      if (!wantsMotion(item)) return size === 'preview' ? stillFor(item) : (item.type === 'animated' ? stillFor(item) : item[size]);
      return item[size];
    }
    function updateCardMotion(card, item) {
      card.querySelectorAll('img[data-size]').forEach(img => {
        const source = chooseSource(item, img.dataset.size);
        if (safeLocalPath(source) && img.getAttribute('src') !== source) img.src = source;
      });
      const control = card.querySelector('.emote-motion-control');
      if (control) {
        control.textContent = wantsMotion(item) ? 'Ver pose quieta' : 'Reproducir este emote';
        control.setAttribute('aria-label', `${wantsMotion(item) ? 'Detener' : 'Reproducir'} ${item.name}`);
        control.setAttribute('aria-pressed', String(wantsMotion(item)));
      }
    }
    function emoteCard(item) {
      const card = make('article', 'emote-card');
      card.dataset.id = item.id;
      const art = make('div', 'emote-image');
      const main = image(chooseSource(item, 'preview'), `${item.name}, ${typeName(item).toLowerCase()} de Blanco`, 150);
      main.dataset.size = 'preview';
      art.append(main);
      const heading = make('h3', '', item.name);
      card.append(art, make('p', 'emote-type', typeName(item)), heading, make('p', 'emote-use', item.use || item.description || 'Una expresión de Blanco para el chat.'));
      if (item.type === 'animated') {
        const button = make('button', 'emote-control emote-motion-control');
        button.type = 'button';
        button.addEventListener('click', () => {
          if (wantsMotion(item)) stopped.add(item.id);
          else {
            if (!playAll) items.filter(entry => entry.type === 'animated').forEach(entry => stopped.add(entry.id));
            playAll = true; stopped.delete(item.id);
          }
          updateCardMotion(card, item);
          syncMotionToggle();
        });
        card.append(button);
      }
      const twitch = twitchState(item);
      card.append(make('p', 'emote-placement-state', twitchLabel(item)));
      if (slotName(item)) card.append(make('p', 'emote-slot', slotName(item)));
      const code = make('div', 'emote-code');
      if (twitch.code) {
        const canCopy = twitch.assigned && twitch.moderation === 'no_pending_label';
        code.append(make('span', '', canCopy ? 'Código guardado; falta prueba en chat' : 'Código guardado, aún no disponible'), make('code', '', twitch.code));
        if (canCopy) {
          const copy = make('button', 'emote-control', 'Copiar código');
          copy.type = 'button';
          copy.setAttribute('aria-label', `Copiar código de ${item.name}`);
          copy.addEventListener('click', () => copyText(twitch.code, copy));
          code.append(copy);
        }
      } else code.append(make('span', '', 'Código guardado por confirmar.'));
      card.append(code);
      const detail = make('details', 'size-detail');
      const summary = make('summary', '', 'Ver 28, 56 y 112 px');
      const samples = make('div', 'size-samples');
      [['small', 28], ['medium', 56], ['large', 112]].forEach(([size, pixels]) => {
        const fig = make('figure');
        const img = image(chooseSource(item, size), `${item.name} a ${pixels} píxeles`, pixels);
        img.dataset.size = size;
        fig.append(img, make('figcaption', '', `${pixels} px`));
        samples.append(fig);
      });
      detail.append(summary, samples, make('p', 'size-description', item.description || item.use || ''));
      card.append(detail);
      updateCardMotion(card, item);
      return card;
    }
    function render() {
      const query = normalize(search.value);
      const matches = items.filter(item => (type === 'all' || type === item.type) && (category === 'all' || item.category === category) && (placement.value === 'all' || (placement.value === 'assigned' ? twitchState(item).assigned : twitchState(item).uploaded && !twitchState(item).assigned)) && normalize([item.name, item.use, item.description, item.category, twitchState(item).code].join(' ')).includes(query));
      result.textContent = `${matches.length} ${matches.length === 1 ? 'emote' : 'emotes'} de ${items.length}${type !== 'all' ? ` · ${type === 'animated' ? 'animados' : 'estáticos'}` : ''}.`;
      grid.replaceChildren(...matches.map(emoteCard));
      if (!matches.length) {
        const box = make('div', 'empty-state');
        box.append(make('h3', '', 'No hay emotes con esos filtros.'), make('p', '', 'Prueba otro nombre o vuelve a mostrar toda la familia.'));
        const clear = make('button', 'button secondary', 'Quitar filtros');
        clear.type = 'button';
        clear.addEventListener('click', () => {
          search.value = ''; type = 'all'; category = 'all'; placement.value = 'all';
          $('#emote-types').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === 'all')));
          $('#emote-categories').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === 'all')));
          render(); search.focus();
        });
        box.append(clear); grid.append(box);
      }
    }
    categoryFilters($('#emote-categories'), [...new Set(items.map(item => item.category).filter(Boolean))], value => { category = value; render(); });
    $('#emote-types').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      type = button.dataset.type;
      $('#emote-types').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      render();
    }));
    search.addEventListener('input', render);
    placement.addEventListener('change', render);
    motionToggle.addEventListener('change', () => { playAll = motionToggle.checked; motionToggle.indeterminate = false; stopped.clear(); render(); });
    reducedMedia.addEventListener('change', () => { playAll = !reducedMedia.matches; stopped.clear(); syncMotionToggle(); motionNote(); render(); });
    const exemplar = items.find(item => item.type === 'static') || items[0];
    if (exemplar) $('#extension-example').replaceChildren(image(stillFor(exemplar), 'Blanco representado como imagen en vez de texto', 70));
    render();
  }

  async function commands() {
    const list = $('#command-list');
    const search = $('#command-search');
    const status = $('#command-status');
    const result = $('#command-results');
    let data;
    try { data = await readData('commands'); } catch (_) {
      result.textContent = 'La lista local no está disponible todavía.';
      $('#command-verified').textContent = 'Puedes consultar directamente la lista pública de Nightbot.';
      notice(list, 'No se pudo cargar la lista.', 'Vuelve a cargar cuando termine la revisión de configuración.', () => location.reload());
      $('#configuration-changes').replaceChildren(make('p', 'muted', 'Los ajustes aparecerán después de revisar la configuración.'));
      return;
    }
    const items = Array.isArray(data.commands) ? data.commands : [];
    let category = 'all';
    const labels = { verified: 'Configuración revisada', needs_review: 'Por revisar', disabled: 'Retirado' };
    if (data.sourceUrl && /^https:\/\/nightbot\.tv\//.test(data.sourceUrl)) $('#nightbot-source').href = data.sourceUrl;
    const date = data.verifiedAt ? new Date(data.verifiedAt) : null;
    const dateText = date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'America/Santiago' }).format(date) : String(data.verifiedAt || 'Fecha de revisión por confirmar');
    $('#command-verified').textContent = `Configuración revisada: ${dateText}. Datos comprobados en el panel de Nightbot y la lista pública; respuestas pendientes de prueba en el chat.`;
    $('#command-source-note').textContent = `Fuentes: panel autenticado de Nightbot y lista pública de ElGutiGangas. Revisión: ${dateText}.`;
    function copyButton(label, text, title) {
      const button = make('button', 'button secondary copy-button', label);
      button.type = 'button';
      button.setAttribute('aria-label', title);
      button.addEventListener('click', () => copyText(text, button));
      return button;
    }
    function commandCard(item) {
      const card = make('article', 'command-card');
      card.dataset.name = item.name;
      const top = make('div', 'command-top');
      const name = make('h3', '', item.name);
      top.append(name, copyButton('Copiar', item.name, `Copiar comando ${item.name}`));
      card.append(top, make('span', `command-state ${item.status || 'needs_review'}`, labels[item.status] || 'Por revisar'), make('p', 'command-description', item.description || 'Descripción por revisar.'));
      const meta = make('div', 'command-meta');
      if (item.category) meta.append(make('span', '', item.category));
      if (item.permission) meta.append(make('span', '', `Permiso: ${item.permission}`));
      if (item.cooldown !== undefined && item.cooldown !== null) meta.append(make('span', '', `Espera: ${typeof item.cooldown === 'number' ? `${item.cooldown} s` : item.cooldown}`));
      if (meta.childNodes.length) card.append(meta);
      if (item.note) card.append(make('p', 'command-note', item.note));
      const detail = make('details', 'command-detail');
      detail.append(make('summary', '', 'Cómo usarlo'));
      const usage = item.usage || item.name;
      const usageLine = make('div', 'command-example');
      usageLine.append(make('code', '', usage));
      detail.append(usageLine);
      if (item.example) {
        detail.append(make('p', 'small muted', 'Ejemplo para copiar:'));
        const exampleLine = make('div', 'command-example');
        exampleLine.append(make('code', '', item.example), copyButton('Copiar ejemplo', item.example, `Copiar ejemplo de ${item.name}`));
        detail.append(exampleLine);
      }
      if (item.response) detail.append(make('p', 'command-response-label', 'Respuesta configurada'), make('p', 'command-response', item.response));
      card.append(detail);
      return card;
    }
    function render() {
      const query = normalize(search.value);
      const matches = items.filter(item => (category === 'all' || item.category === category) && (status.value === 'all' || item.status === status.value) && normalize([item.name, item.category, item.description, item.usage].join(' ')).includes(query));
      result.textContent = `${matches.length} ${matches.length === 1 ? 'comando' : 'comandos'} de ${items.length}.`;
      list.replaceChildren(...matches.map(commandCard));
      if (!matches.length) {
        const box = make('div', 'empty-state');
        box.append(make('h3', '', 'No hay comandos con esos filtros.'), make('p', '', 'Prueba otra palabra o muestra todas las categorías.'));
        const clear = make('button', 'button secondary', 'Quitar filtros'); clear.type = 'button';
        clear.addEventListener('click', () => {
          search.value = ''; status.value = 'all'; category = 'all';
          $('#command-categories').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === 'all')));
          render(); search.focus();
        });
        box.append(clear); list.append(box);
      }
    }
    categoryFilters($('#command-categories'), [...new Set(items.map(item => item.category).filter(Boolean))], value => { category = value; render(); });
    search.addEventListener('input', render); status.addEventListener('change', render);
    const changes = Array.isArray(data.configurationChanges) ? data.configurationChanges : [];
    const changeContainer = $('#configuration-changes');
    changeContainer.replaceChildren();
    if (changes.length) {
      const ul = make('ul', 'configuration-list');
      changes.forEach(change => {
        const li = make('li');
        if (typeof change === 'string') li.append(make('p', '', change));
        else {
          li.append(make('h3', '', change.title || change.name || change.command || 'Ajuste de configuración'), make('p', '', change.description || change.note || change.reason || 'Revisión pendiente.'));
          if (change.status) {
            const stateLabel = { applied: 'Aplicado y revisado', planned: 'Preparado para configurar', needs_review: 'Por revisar', blocked: 'Necesita revisión' }[change.status] || change.status;
            li.append(make('p', 'change-state', stateLabel));
          }
        }
        ul.append(li);
      });
      changeContainer.append(ul);
    } else changeContainer.append(make('p', 'muted', 'La revisión no registra cambios propuestos en esta lista.'));
    render();
  }
  if (page === 'home') home();
  else if (page === 'emotes') emotes();
  else if (page === 'commands') commands();
})();
