(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { page: null, current: '', next: '', width: '1440' };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') n.textContent = props[k]; else if (k === 'cls') n.className = props[k]; else n.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function api(path, method, body) {
    return fetch(path, { method: method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-requested-with': 'cms' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
        return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Request failed'); e.data = d; throw e; } return d; });
      });
  }
  var toastTimer;
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' error' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, bad ? 7000 : 4000);
  }
  function fmt(iso) { try { return new Date(iso.indexOf('Z') < 0 && iso.indexOf('+') < 0 ? iso + 'Z' : iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso || ''; } }

  /* ---------- page list ---------- */
  function loadList() {
    api('/api/pages').then(function (d) {
      var box = $('rows'); box.textContent = '';
      d.pages.forEach(function (p) {
        var pill = el('span', { cls: 'pill' + (p.status === 'publish' ? ' live' : (p.status === 'draft' ? ' draft' : '')), text: p.error ? 'Error' : (p.status === 'publish' ? 'Live' : (p.status === 'draft' ? 'Draft' : p.status)) });
        pill.insertBefore(el('i'), pill.firstChild);
        var btn = el('button', { cls: 'btn btn-sm', type: 'button', text: 'Edit page' });
        btn.addEventListener('click', function () { openPage(p.id); });
        box.appendChild(el('div', { cls: 'page-row' }, [
          el('div', {}, [el('div', { cls: 'pr-name', text: p.name }), el('div', { cls: 'pr-meta' }, [pill, el('span', { text: p.error ? p.error : '/' + p.slug + '/' }), el('span', { text: p.modified ? 'Updated ' + fmt(p.modified) : '' })])]),
          btn
        ]));
      });
    }).catch(function (e) { $('rows').textContent = e.message; });
  }

  /* ---------- editor ---------- */
  function openPage(id) {
    state.next = ''; $('msgs').textContent = ''; $('fileInfo').textContent = ''; $('paste').value = ''; $('pub').disabled = true;
    api('/api/pages/' + id).then(function (d) {
      state.page = d; state.current = d.html; state.next = '';
      $('list').hidden = true; $('edit').hidden = false;
      $('eName').textContent = d.name;
      $('eMeta').textContent = (d.status === 'publish' ? 'Live' : d.status) + ' · last updated ' + fmt(d.modified) + ' · ' + Math.round(d.html.length / 1024) + ' KB';
      $('dl').href = '/api/pages/' + id + '/download'; $('live').href = d.link;
      $('tabCur').hidden = false;
      stagePlaceholder(); loadRevs(); statusUi();
      setTab('cur');
    }).catch(function (e) { toast(e.message, true); });
  }
  function statusUi() {
    var live = state.page.status === 'publish';
    $('statusLead').textContent = live ? 'The page is live on lyzr.ai. Move it to draft to take it offline while you work on it. Visitors will see a "page not found".' : 'The page is a draft: it is NOT visible on lyzr.ai. Saving HTML above keeps it without making it live. Set it live when it is ready.';
    $('statusBtn').textContent = live ? 'Move to draft (take offline)' : 'Set live';
    $('statusBtn').className = 'btn btn-sm ' + (live ? 'btn-danger' : 'btn-accent');
    $('pubTitle').textContent = live ? 'Publish' : 'Save changes';
    $('pubLead').textContent = live ? 'Replaces the live page. Look at Desktop, Tablet and Mobile first.' : 'Saves the HTML. The page stays a draft until you set it live.';
    $('pub').textContent = live ? 'Publish to live page' : 'Save (stays draft)';
    $('live').textContent = live ? 'View live page ↗' : 'Open page ↗';
    $('eMeta').textContent = (live ? 'Live' : 'Draft (offline)') + ' · last updated ' + fmt(state.page.modified) + ' · ' + Math.round(state.current.length / 1024) + ' KB';
  }
  $('statusBtn').addEventListener('click', function () {
    var live = state.page.status === 'publish';
    confirmBox(live ? 'Move to draft?' : 'Set the page live?',
      live ? state.page.name + ' goes offline on lyzr.ai right now. Visitors, search engines and links to it will get "page not found" until you set it live again.' : state.page.name + ' becomes visible on lyzr.ai right now.',
      live ? 'Move to draft' : 'Set live').then(function (yes) {
      if (!yes) return;
      $('statusBtn').disabled = true;
      api('/api/pages/' + state.page.id + '/status', 'POST', { status: live ? 'draft' : 'publish' }).then(function () {
        toast(live ? 'Moved to draft. The page is offline.' : 'The page is live.'); openPage(state.page.id);
      }).catch(function (e) { toast(e.message, true); }).then(function () { $('statusBtn').disabled = false; });
    });
  });
  function stagePlaceholder() { /* shown until a file is loaded */ $('stage').textContent = ''; $('stage').appendChild(el('div', { cls: 'empty', text: 'Upload a file to see the preview, or open "Current live HTML" to see what is live now.' })); }
  function frame(html, w) {
    var doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}body{font-family:system-ui,sans-serif}</style></head><body>' + html + '</body></html>';
    var f = el('iframe', { cls: 'frame', sandbox: 'allow-scripts', title: 'Preview' });
    f.style.width = (w === 'cur' ? 1440 : w) + 'px';
    f.setAttribute('srcdoc', doc);
    return f;
  }
  function show(which) {
    var w = which === 'cur' ? '1440' : which;
    var html = which === 'cur' ? state.current : state.next;
    var stage = $('stage'); stage.textContent = '';
    if (!html) { stagePlaceholder(); return; }
    stage.appendChild(frame(html, w));
  }
  function setTab(which, quiet) {
    state.width = which;
    Array.prototype.forEach.call($('tabs').children, function (t) { t.classList.toggle('on', t.getAttribute('data-w') === which); });
    if (!quiet || state.next) show(which);
  }
  $('tabs').addEventListener('click', function (e) { var w = e.target.getAttribute && e.target.getAttribute('data-w'); if (w) setTab(w); });

  function renderMsgs(res) {
    var ul = $('msgs'); ul.textContent = '';
    res.errors.forEach(function (m) { ul.appendChild(el('li', { cls: 'err', text: 'Fix: ' + m.msg })); });
    res.warnings.forEach(function (m) { ul.appendChild(el('li', { cls: 'warn', text: 'Check: ' + m.msg })); });
    if (!res.errors.length) ul.insertBefore(el('li', { cls: 'ok', text: 'No blocking problems.' + (res.warnings.length ? ' ' + res.warnings.length + ' thing' + (res.warnings.length > 1 ? 's' : '') + ' to look at.' : '') }), ul.firstChild);
    $('pub').disabled = res.errors.length > 0;
  }
  function loadHtml(text, name) {
    state.next = text; $('fileInfo').textContent = (name || 'pasted HTML') + ' · ' + Math.round(text.length / 1024) + ' KB';
    api('/api/pages/' + state.page.id + '/check', 'POST', { html: text }).then(function (res) {
      renderMsgs(res);
      setTab(state.width === 'cur' ? '1440' : state.width);
    }).catch(function (e) { toast(e.message, true); });
  }
  var drop = $('drop'), file = $('file');
  drop.addEventListener('click', function () { file.click(); });
  ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  function readFile(f) { if (!f) return; var r = new FileReader(); r.onload = function () { loadHtml(String(r.result), f.name); }; r.readAsText(f); }
  drop.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });
  file.addEventListener('change', function () { readFile(file.files[0]); file.value = ''; });
  $('usePaste').addEventListener('click', function () { var t = $('paste').value; if (t.trim()) loadHtml(t, ''); });

  /* ---------- publish ---------- */
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var m = el('div', { cls: 'modal' }, [el('div', { cls: 'box' }, [el('h3', { text: title }), el('p', { text: text }),
        el('div', { cls: 'btn-row' }, [el('button', { cls: 'btn btn-accent', type: 'button', text: okLabel }), el('button', { cls: 'btn btn-ghost', type: 'button', text: 'Cancel' })])])]);
      var b = m.querySelectorAll('button');
      b[0].addEventListener('click', function () { m.remove(); resolve(true); });
      b[1].addEventListener('click', function () { m.remove(); resolve(false); });
      document.body.appendChild(m);
    });
  }
  $('pub').addEventListener('click', function () {
    if (!state.next) return;
    confirmBox(state.page.status === 'publish' ? 'Publish to the live page?' : 'Save the HTML?', state.page.status === 'publish' ? 'This replaces ' + state.page.name + ' on lyzr.ai right now. The current version is kept under "Earlier versions".' : 'The page is a draft, so this is not visible on lyzr.ai. Use "Set live" when it is ready.', state.page.status === 'publish' ? 'Publish' : 'Save').then(function (yes) {
      if (!yes) return;
      $('pub').disabled = true; $('pub').textContent = 'Publishing…';
      api('/api/pages/' + state.page.id + '/publish', 'POST', { html: state.next, modified: state.page.modified }).then(function (r) {
        toast((state.page.status === 'publish' ? 'Published.' : 'Saved as draft.') + (r.uploadedImages ? ' ' + r.uploadedImages + ' image(s) moved to the media library.' : ''));
        $('pub').textContent = state.page.status === 'publish' ? 'Publish to live page' : 'Save (stays draft)';
        openPage(state.page.id);
      }).catch(function (e) {
        $('pub').textContent = state.page.status === 'publish' ? 'Publish to live page' : 'Save (stays draft)'; $('pub').disabled = false;
        if (e.data && e.data.errors) renderMsgs({ errors: e.data.errors, warnings: e.data.warnings || [] });
        toast(e.message, true);
      });
    });
  });

  /* ---------- revisions ---------- */
  function loadRevs() {
    var box = $('revs'); box.textContent = 'Loading…';
    api('/api/pages/' + state.page.id + '/revisions').then(function (d) {
      box.textContent = '';
      if (!d.revisions.length) { box.textContent = 'No earlier versions yet.'; return; }
      var t = el('div');
      d.revisions.forEach(function (r) {
        var b = el('button', { cls: 'btn btn-ghost btn-sm', type: 'button', text: 'Restore' });
        b.addEventListener('click', function () {
          confirmBox('Restore this version?', 'The live page is replaced with the version saved ' + fmt(r.date) + '. The current live version is kept as an earlier version too.', 'Restore').then(function (yes) {
            if (!yes) return;
            api('/api/pages/' + state.page.id + '/restore', 'POST', { revisionId: r.id }).then(function () { toast('Restored.'); openPage(state.page.id); }).catch(function (e) { toast(e.message, true); });
          });
        });
        t.appendChild(el('div', { cls: 'rev-row' }, [el('span', { text: fmt(r.date) }), b]));
      });
      box.appendChild(t);
    }).catch(function (e) { box.textContent = e.message; });
  }

  /* ---------- shell ---------- */
  $('back').addEventListener('click', function () { $('edit').hidden = true; $('list').hidden = false; loadList(); });
  $('out').addEventListener('click', function () { api('/auth/logout', 'POST').then(function () { location.reload(); }); });
  window.addEventListener('beforeunload', function (e) { if (state.next && !$('edit').hidden && !$('pub').disabled) { e.preventDefault(); e.returnValue = ''; } });
  api('/auth/me').then(function (m) { $('who').textContent = m.email; $('test').hidden = !m.test; loadList();
    var h = /^#page-(\d+)$/.exec(location.hash); if (h) openPage(Number(h[1]));
  });
})();
