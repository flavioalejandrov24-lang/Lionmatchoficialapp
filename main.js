/* ═══════════════════════════════════════════════════════
   LionMatch — main.js  (archivo único consolidado)
   FIXES v2: TOKEN_REFRESH_FAILED, closeLightbox global,
   INITIAL_SESSION, Promise.all paralelo, obStep reset,
   rAF para animaciones, selectedInterests reset.
═══════════════════════════════════════════════════════ */
(async function () {
  'use strict';

  /* ════════════════════════════════════════════════════
     1. CONFIGURACIÓN
  ════════════════════════════════════════════════════ */
  const SB_URL = 'https://fjevgfyqqsfankvledpl.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZXZnZnlxcXNmYW5rdmxlZHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2Nzk0NjIsImV4cCI6MjA4NjI1NTQ2Mn0.AmysLsRq_KBXYculm0Nyw3a0abWLQ8zTt-2OSo-6PSA';

  window.sb          = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
    }
  });
  window.ADMIN_EMAIL = 'compualextech24@gmail.com';
  window.MSG_LIMIT   = 5;

  window.INTERESTS_LIST = [
    { emoji: '🎵', label: 'Música' },      { emoji: '⚽', label: 'Deportes' },
    { emoji: '✈️', label: 'Viajes' },      { emoji: '🍕', label: 'Gastronomía' },
    { emoji: '🎬', label: 'Cine & Series'},{ emoji: '📚', label: 'Lectura' },
    { emoji: '🎮', label: 'Videojuegos' }, { emoji: '💪', label: 'Fitness' },
    { emoji: '🎨', label: 'Arte' },        { emoji: '🌿', label: 'Naturaleza' },
    { emoji: '🐾', label: 'Mascotas' },    { emoji: '💃', label: 'Bailar' },
    { emoji: '📸', label: 'Fotografía' },  { emoji: '🧘', label: 'Bienestar' },
    { emoji: '🍻', label: 'Vida nocturna'},{ emoji: '🎯', label: 'Juegos de mesa' },
    { emoji: '👨‍🍳', label: 'Cocinar' },   { emoji: '🎸', label: 'Conciertos' },
    { emoji: '🤝', label: 'Voluntariado'}, { emoji: '🧳', label: 'Aventura' },
  ];

  /* ════════════════════════════════════════════════════
     2. ESTADO GLOBAL
  ════════════════════════════════════════════════════ */
  window.user                   = null;
  window.profiles               = [];
  window.pIdx                   = 0;
  window.matches                = [];
  window.convos                 = [];
  const _savedTrash = (() => { try { return JSON.parse(localStorage.getItem('lionmatch_trash') || '[]'); } catch { return []; } })();
  window.trashedConvos          = new Set(_savedTrash);
  window.verifyPhotoDataURL     = null;
  window.obStep                 = 1;
  window.photoDataURL           = null;
  window.photoDataURL2          = null;
  window.photoDataURL3          = null;
  window.photoDataURL4          = null;
  window.deletedSlots           = {};
  window.selectedInterests      = [];
  window.currentChatUserId      = null;
  window.currentChatIsActive    = false;
  window.currentChatUserProfile = null;
  window.prevChatScreen         = 'messages';
  window.realtimeChannel        = null;
  window.chatRealtimeChannel    = null;
  window._successCb             = null;
  window.navStack               = [];
  window._bootDone              = false;

  /* ════════════════════════════════════════════════════
     3. INIT
  ════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', async () => {
    buildInterestChips();
    initTogglePw();
    initChips();
    initPhotoUploads();
    initMiniDeleteBtns();
    initModals();
    initSidebar();
    initForms();
    initBioCounters();

    /* ── Manejo completo del ciclo de sesión ────────────────────────
       Supabase v2 emite estos eventos:
       · INITIAL_SESSION   → se dispara al cargar con sesión guardada
       · SIGNED_IN         → login manual o renovación exitosa
       · TOKEN_REFRESHED   → el access token fue renovado en background
       · TOKEN_REFRESH_FAILED → la renovación falló (sesión expirada)
       · SIGNED_OUT        → logout explícito
       ──────────────────────────────────────────────────────────────── */
    sb.auth.onAuthStateChange(async (event, session) => {

      // ── Sesión expirada sin posibilidad de renovar ───────────────
      if (event === 'TOKEN_REFRESH_FAILED') {
        window._bootDone = false;
        user = null;
        stopRealtime();
        navStack = [];
        hideSplash();
        showScreen('login', false);
        toast('Sesión expirada. Por favor vuelve a ingresar.', 'err');
        return;
      }

      // ── Logout explícito ─────────────────────────────────────────
      if (event === 'SIGNED_OUT') {
        window._bootDone = false;
        user = null;
        stopRealtime();
        navStack = [];
        hideSplash();
        showScreen('login', false);
        return;
      }

      // ── Token renovado en background → actualizar user ───────────
      if (event === 'TOKEN_REFRESHED' && session) {
        user = session.user;
        return;
      }

      // ── Ya arrancado por getSession() o handleLogin() → ignorar ──
      if (window._bootDone) return;

      // ── Primera sesión al cargar (INITIAL_SESSION o SIGNED_IN) ───
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
        window._bootDone = true;
        user = session.user;
        await loadProfile();
        hideSplash();
        goHome();
      }
    });

    // Esperamos hasta 1200ms para que Supabase dispare INITIAL_SESSION.
    // El splash cubre este tiempo — si no hay sesión, lo ocultamos y mostramos login.
    await new Promise(r => setTimeout(r, 1200));
    if (!window._bootDone) {
      hideSplash();
      showScreen('login', false);
    }
  });

  /* ════════════════════════════════════════════════════
     4. NAVEGACIÓN CON HISTORIAL
  ════════════════════════════════════════════════════ */
  const ROOT_SCREENS = new Set(['login', 'register', 'onboarding', 'discovery']);

  /* ── Ocultar splash con fade ─────────────────────────────────── */
  window.hideSplash = function () {
    const splash = document.getElementById('splash-screen');
    if (!splash || splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    // Limpiarlo del DOM después de la transición para no bloquear clicks
    setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 700);
  };

  window.showScreen = function (id, pushHistory = true) {
    const current = document.querySelector('.screen.active')?.id?.replace('-screen', '');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id + '-screen')?.classList.add('active');
    if (pushHistory && current && current !== id && !ROOT_SCREENS.has(id)) {
      navStack.push(current);
      if (navStack.length > 15) navStack.shift();
    }
  };

  window.goBack = function () {
    if (navStack.length === 0) return;
    const prev = navStack.pop();
    showScreen(prev, false);
    if      (prev === 'messages') { Promise.all([loadMatches(), loadConvos()]); }
    else if (prev === 'matches')  { loadMatchesPage(); }
    else if (prev === 'profile')  { renderProfile(); }
  };

  window.goHome = function () {
    showAdminIfNeeded();
    navStack = [];
    if (user?.profile?.name) {
      showScreen('discovery', false);
      loadProfiles();
      startRealtimeMessages();
    } else {
      // FIX: resetear estado del onboarding al entrar
      obStep = 1;
      selectedInterests = [];
      photoDataURL = null; photoDataURL2 = null; photoDataURL3 = null; photoDataURL4 = null;
      // Limpiar cualquier spinner residual de botones del onboarding
      document.querySelectorAll('#onboarding-screen .btn').forEach(b => b.classList.remove('loading'));
      showScreen('onboarding', false);
    }
  };

  /* ════════════════════════════════════════════════════
     6. REALTIME
  ════════════════════════════════════════════════════ */
  // Timestamp del último fetch completo de convos (para evitar recargas innecesarias)
  let _lastConvosLoad = 0;
  const _CONVOS_TTL   = 30_000; // 30 segundos de cache

  const _origLoadConvos = null; // placeholder, se sobreescribe abajo

  window.startRealtimeMessages = function () {
    stopRealtime();
    realtimeChannel = sb.channel('messages-list')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, (payload) => {
        const scr = document.querySelector('.screen.active');
        if (scr?.id === 'messages-screen') { Promise.all([loadMatches(), loadConvos()]); }
        if (scr?.id === 'chat-screen' && payload.new.sender_id === currentChatUserId) {
          appendMessage(payload.new);
        }
        if (!(scr?.id === 'chat-screen' && payload.new.sender_id === currentChatUserId)) {
          toast('💌 Nueva solicitud de conexión', 'info');
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `sender_id=eq.${user.id}`
      }, (payload) => {
        const scr = document.querySelector('.screen.active');
        if (payload.new.status === 'active' && payload.old.status === 'pending') {
          toast('🎉 ¡Aceptaron tu solicitud!', 'ok');
          if (scr?.id === 'messages-screen') { Promise.all([loadMatches(), loadConvos()]); }
          if (scr?.id === 'chat-screen' && payload.new.receiver_id === currentChatUserId) {
            currentChatIsActive = true;
            const inp = document.getElementById('chat-input');
            const sb2 = document.getElementById('send-btn');
            inp.disabled = false; sb2.disabled = false;
            inp.placeholder = 'Escribe un mensaje…';
            loadChatMsgs(currentChatUserId);
          }
        }
        if (payload.new.status === 'rejected') {
          toast('Tu solicitud no fue aceptada', 'err');
          if (scr?.id === 'messages-screen') loadConvos();
        }
      }).subscribe();
  };

  window.startChatRealtime = function (oid) {
    if (chatRealtimeChannel) { sb.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
    chatRealtimeChannel = sb.channel(`chat-${user.id}-${oid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `sender_id=eq.${oid}`
      }, (payload) => {
        // Solo agregar mensajes del OTRO usuario — los propios ya los agrega sendMessage()
        if (payload.new.receiver_id === user.id && payload.new.sender_id !== user.id) {
          appendMessage(payload.new);
          maybeNotify(payload.new, currentChatUserProfile);
        }
      }).subscribe();
  };

  window.stopRealtime = function () {
    if (realtimeChannel)     { sb.removeChannel(realtimeChannel);     realtimeChannel = null; }
    if (chatRealtimeChannel) { sb.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
  };

  /* ════════════════════════════════════════════════════
     7. AUTENTICACIÓN
  ════════════════════════════════════════════════════ */
  async function handleLogin(e) {
    e.preventDefault();
    if (!document.getElementById('age-confirm').checked) {
      toast('Confirma que eres mayor de edad', 'err'); return;
    }
    const btn = e.target.querySelector('[type=submit]');
    btn.classList.add('loading');
    try {
      console.log('[Login] Iniciando signInWithPassword...');
      const { data, error } = await sb.auth.signInWithPassword({
        email:    document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      });
      console.log('[Login] Respuesta Supabase:', { error, userId: data?.user?.id });
      if (error) throw error;
      window._bootDone = true;
      user = data.user;
      console.log('[Login] Cargando perfil...');
      try {
        await loadProfile();
        console.log('[Login] Perfil cargado:', user.profile);
      } catch (profileErr) {
        console.warn('[Login] loadProfile error (non-fatal):', profileErr);
        user.profile = null;
      }
      console.log('[Login] Llamando goHome()...');
      hideSplash();
      toast('¡Bienvenido de nuevo!', 'ok');
      goHome();
      console.log('[Login] goHome() completado.');
    } catch (authErr) {
      console.error('[Login] Error de autenticación:', authErr);
      window._bootDone = false;
      showError('Correo o contraseña incorrectos.', 'Acceso denegado');
    } finally {
      console.log('[Login] finally: quitando spinner del botón.');
      btn.classList.remove('loading');
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const pw    = document.getElementById('reg-pw').value;
    const pw2   = document.getElementById('reg-pw2').value;
    if (!document.getElementById('reg-age').checked) { showError('Debes confirmar que eres mayor de 18 años.', 'Edad requerida'); return; }
    if (!email.includes('@'))  { showError('Correo inválido.', 'Correo'); return; }
    if (pw.length < 6)         { showError('Contraseña mínimo 6 caracteres.', 'Contraseña corta'); return; }
    if (pw !== pw2)            { showError('Las contraseñas no coinciden.', 'Error'); return; }
    const btn = e.target.querySelector('[type=submit]');
    btn.classList.add('loading');
    try {
      const { data, error } = await sb.auth.signUp({
        email, password: pw,
        options: { emailRedirectTo: 'https://lionmatchappoficial.vercel.app/' },
      });
      if (error) {
        const m = (error.message || '').toLowerCase();
        if (m.includes('already') || m.includes('exists')) showError(`"${email}" ya tiene cuenta.`, 'Ya registrado');
        else showError(error.message, 'Error');
        return;
      }
      if (data?.user?.identities?.length === 0) { showError(`"${email}" ya está registrado.`, 'Ya existe'); return; }
      if (data.user) await sb.from('profiles').upsert(
        { user_id: data.user.id, email, created_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      showScreen('login');
      showSuccess(`Te enviamos un correo a "${email}". Verifica tu cuenta y luego inicia sesión.`, '📬 Revisa tu correo', null);
    } catch (err) {
      showError(err.message || 'Error inesperado.', 'Error');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function handleLogout() {
    closeSidebar();
    stopRealtime();
    window._bootDone = false;
    trashedConvos.clear(); saveTrash(); updateTrashBadge();
    await sb.auth.signOut();
    user = null;
    showScreen('login');
    toast('Sesión cerrada');
  }

  async function handleRecovery() {
    const email = document.getElementById('rec-email').value.trim();
    if (!email.includes('@')) { showError('Correo inválido.', 'Correo'); return; }
    const btn = document.getElementById('rec-send');
    btn.classList.add('loading');
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://lionmatchappoficial.vercel.app/'
      });
      if (error) throw error;
      closeModal('m-recovery');
      showSuccess(`Enlace enviado a "${email}".`, 'Correo enviado');
    } catch {
      showError('No se pudo enviar el correo.', 'Error');
    } finally {
      btn.classList.remove('loading');
    }
  }

  /* ════════════════════════════════════════════════════
     8. DISCOVERY
  ════════════════════════════════════════════════════ */
  async function loadProfiles() {
    const stack = document.getElementById('card-stack');
    document.getElementById('no-cards').style.display = 'none';
    stack.querySelectorAll('.swipe-card,.skeleton-card').forEach(c => c.remove());

    const skelCard = document.createElement('div');
    skelCard.className = 'skeleton-card';
    skelCard.innerHTML = `<div class="skeleton skel-img"></div><div style="z-index:2;width:100%"><div class="skeleton skel-name"></div><div class="skeleton skel-meta"></div><div class="skel-tags"><div class="skeleton skel-tag"></div><div class="skeleton skel-tag"></div></div></div>`;
    stack.appendChild(skelCard);

    try {
      const myP = user.profile || {};
      const { data: liked } = await sb.from('likes').select('liked_user_id').eq('user_id', user.id);
      const exc = (liked || []).map(l => l.liked_user_id);
      exc.push(user.id);

      let q = sb.from('profiles').select('*').eq('location', 'León, Guanajuato').neq('user_id', user.id);
      if (exc.length > 0) q = q.not('user_id', 'in', `(${exc.join(',')})`);
      if (myP.seeking && myP.seeking !== 'Todos') q = q.eq('gender', myP.seeking === 'Hombres' ? 'Hombre' : 'Mujer');
      if (myP.age_min) q = q.gte('age', myP.age_min);
      if (myP.age_max) q = q.lte('age', myP.age_max);

      const { data, error } = await q.limit(20);
      if (error) throw error;
      profiles = [...(data || [])];
      pIdx = 0;
    } catch (err) {
      console.error(err);
      profiles = []; pIdx = 0;
      toast('No se pudieron cargar los perfiles', 'err');
    } finally {
      stack.querySelectorAll('.skeleton-card').forEach(c => c.remove());
      renderCard();
    }
  }

  function renderCard() {
    const stack = document.getElementById('card-stack');
    stack.querySelectorAll('.swipe-card').forEach(c => c.remove());
    const hasCards = pIdx < profiles.length;
    ['like-btn', 'dislike-btn', 'super-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.visibility = hasCards ? 'visible' : 'hidden';
    });
    if (!hasCards) { document.getElementById('no-cards').style.display = 'flex'; return; }
    document.getElementById('no-cards').style.display = 'none';
    const p = profiles[pIdx];
    const card = document.createElement('div');
    card.className = 'swipe-card';
    if (p.photo_url) card.innerHTML = `<img src="${p.photo_url}" alt="${escapeHtml(p.name)}" draggable="false" crossorigin="anonymous" loading="eager">`;
    else             card.innerHTML = `<div class="no-photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    const tags      = p.interests ? p.interests.split(',').slice(0, 3).map(t => `<span class="card-tag">${escapeHtml(t.trim())}</span>`).join('') : '';
    const meta      = [p.gender, p.age ? `${p.age} años` : ''].filter(Boolean).join(' · ');
    const veriBadge = p.verification_status === 'approved'
      ? '<span style="display:inline-flex;align-items:center;gap:.2rem;background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);border-radius:50px;padding:.1rem .5rem;font-size:.68rem;font-weight:700;color:#34d399;margin-left:.35rem">✓</span>' : '';
    card.innerHTML += `<div class="card-info"><h3>${escapeHtml(p.name)}${veriBadge}</h3>${meta ? `<div class="card-meta">${meta}</div>` : ''}<p>${p.bio ? escapeHtml(p.bio.slice(0, 80)) + (p.bio.length > 80 ? '…' : '') : 'León, Guanajuato'}</p>${tags}</div><div class="hint hint-like">LIKE</div><div class="hint hint-nope">NOPE</div>`;
    stack.appendChild(card);
    addDragHandlers(card);
  }

  function addDragHandlers(card) {
    let sx = 0, cx = 0, drag = false;
    // FIX: usar rAF para las animaciones de drag → evita Forced Reflow
    let rafId = null;
    const start = e => {
      drag = true;
      sx = e.touches ? e.touches[0].clientX : e.clientX;
      cx = sx;
      card.style.transition = 'none';
    };
    const move = e => {
      if (!drag) return;
      cx = e.touches ? e.touches[0].clientX : e.clientX;
      if (rafId) return; // throttle con rAF
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const d = cx - sx;
        card.style.transform = `translateX(${d}px) rotate(${d * .07}deg)`;
        card.querySelector('.hint-like').classList.toggle('show', d > 60);
        card.querySelector('.hint-nope').classList.toggle('show', d < -60);
      });
    };
    const end = () => {
      if (!drag) return; drag = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      const d = cx - sx;
      card.style.transition = 'transform .3s ease';
      if (d > 100)       swipe('like', card);
      else if (d < -100) swipe('dislike', card);
      else { card.style.transform = ''; card.querySelectorAll('.hint').forEach(h => h.classList.remove('show')); }
    };
    card.addEventListener('mousedown',  start);
    card.addEventListener('touchstart', start, { passive: true });
    card.addEventListener('mousemove',  move);
    card.addEventListener('touchmove',  move, { passive: true });
    card.addEventListener('mouseup',    end);
    card.addEventListener('touchend',   end);
    card.addEventListener('mouseleave', () => { if (drag) end(); });
  }

  // Modal de solicitud
  let pendingSwipeProfile = null, pendingSwipeCard = null;

  function initSolicitudModal() {
    document.getElementById('sol-cancel').addEventListener('click', () => {
      closeModal('m-solicitud');
      if (pendingSwipeCard) {
        pendingSwipeCard.style.transition = 'transform .3s ease,opacity .3s ease';
        pendingSwipeCard.style.transform = '';
        pendingSwipeCard.style.opacity = '1';
        pendingSwipeCard.querySelectorAll('.hint').forEach(h => h.classList.remove('show'));
        pendingSwipeProfile = null; pendingSwipeCard = null;
      }
    });
    document.getElementById('sol-send').addEventListener('click', confirmSolicitud);
    document.getElementById('sol-msg').addEventListener('input', () => {
      document.getElementById('sol-char-n').textContent = document.getElementById('sol-msg').value.length;
    });
  }

  function openSolicitudModal(p, cardEl) {
    pendingSwipeProfile = p; pendingSwipeCard = cardEl;
    const wrap = document.getElementById('sol-av-wrap');
    if (p.photo_url) { wrap.innerHTML = `<img src="${p.photo_url}" class="sol-av" alt="${escapeHtml(p.name)}">`; wrap.className = ''; }
    else             { wrap.className = 'sol-av-ph'; wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`; }
    document.getElementById('sol-name').textContent = p.name || '—';
    document.getElementById('sol-meta').textContent = [p.gender, p.age ? `${p.age} años` : ''].filter(Boolean).join(' · ') || 'León, Gto';
    document.getElementById('sol-msg').value = '';
    document.getElementById('sol-char-n').textContent = '0';
    openModal('m-solicitud');
  }

  async function confirmSolicitud() {
    const msg = document.getElementById('sol-msg').value.trim();
    if (!msg) { toast('Escribe un mensaje', 'err'); return; }
    const p = pendingSwipeProfile, cardEl = pendingSwipeCard;
    if (!p) return;
    const btn = document.getElementById('sol-send');
    btn.classList.add('loading');
    try {
      if (cardEl) {
        cardEl.style.transition = 'transform .35s ease,opacity .35s ease';
        cardEl.style.transform = 'translateX(150%) rotate(25deg)';
        cardEl.style.opacity = '0';
        setTimeout(() => { pIdx++; renderCard(); }, 350);
      }
      closeModal('m-solicitud');
      await sb.from('likes').upsert(
        { user_id: user.id, liked_user_id: p.user_id, is_like: true, created_at: new Date().toISOString() },
        { onConflict: 'user_id,liked_user_id' }
      );
      await sb.from('messages').insert({
        sender_id: user.id, receiver_id: p.user_id,
        content: msg, status: 'pending', created_at: new Date().toISOString()
      });
      toast('Solicitud enviada 💌', 'ok');
      pendingSwipeProfile = null; pendingSwipeCard = null;
    } catch (err) {
      console.error(err); toast('Error al enviar solicitud', 'err');
    } finally {
      btn.classList.remove('loading');
    }
  }

  async function swipe(action, cardEl = null) {
    if (!cardEl) cardEl = document.querySelector('.swipe-card');
    if (!cardEl || pIdx >= profiles.length) return;
    const p = profiles[pIdx];
    if (action === 'dislike') {
      cardEl.style.transition = 'transform .35s ease,opacity .35s ease';
      cardEl.style.transform = 'translateX(-150%) rotate(-25deg)';
      cardEl.style.opacity = '0';
      setTimeout(() => { pIdx++; renderCard(); }, 350);
      sb.from('likes').upsert(
        { user_id: user.id, liked_user_id: p.user_id, is_like: false, created_at: new Date().toISOString() },
        { onConflict: 'user_id,liked_user_id' }
      ).catch(console.error);
      return;
    }
    cardEl.style.transition = 'transform .2s ease';
    cardEl.style.transform = 'scale(0.97)';
    openSolicitudModal(p, cardEl);
  }

  /* ════════════════════════════════════════════════════
     9. MATCHES
  ════════════════════════════════════════════════════ */
  async function loadMatches() {
    const { data: matchData } = await sb.from('matches')
      .select('*').or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    if (!matchData || !matchData.length) { matches = []; renderMatches(); return; }
    const otherIds = [...new Set(matchData.map(m => m.user1_id === user.id ? m.user2_id : m.user1_id))];
    const { data: profData } = await sb.from('profiles')
      .select('user_id,name,photo_url,age,gender,verification_status').in('user_id', otherIds);
    const profMap = {};
    (profData || []).forEach(p => profMap[p.user_id] = p);
    matches = matchData.map(m => {
      const oid = m.user1_id === user.id ? m.user2_id : m.user1_id;
      return { ...m, _other: profMap[oid] || null };
    });
    renderMatches();
  }

  function renderMatches() {
    const row = document.getElementById('matches-row');
    row.innerHTML = '';
    if (!matches.length) {
      row.innerHTML = `<p style="color:var(--c-muted);font-size:.83rem;padding:.5rem 0">Sin matches aún</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    matches.forEach(m => {
      const u = m._other; if (!u) return;
      const div = document.createElement('div');
      div.className = 'match-bubble';
      if (u.photo_url) div.innerHTML = `<img src="${u.photo_url}" class="match-av" alt="${escapeHtml(u.name)}" loading="lazy"><span>${escapeHtml(u.name?.split(' ')[0] || '')}</span>`;
      else             div.innerHTML = `<div class="match-av-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><span>${escapeHtml(u.name?.split(' ')[0] || '?')}</span>`;
      div.addEventListener('click', () => openChat(u, true, 'messages'));
      frag.appendChild(div);
    });
    row.appendChild(frag);
  }

  async function loadMatchesPage() {
    const grid       = document.getElementById('matches-grid');
    const countLabel = document.getElementById('matches-count-label');
    grid.innerHTML   = `<div style="grid-column:1/-1;text-align:center;padding:3rem 0;color:var(--c-muted)">Cargando…</div>`;
    try {
      const { data: matchData } = await sb.from('matches')
        .select('*').or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (!matchData || !matchData.length) {
        countLabel.textContent = '0 matches';
        grid.innerHTML = `<div class="matches-empty" style="grid-column:1/-1"><div class="matches-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><h3>Aún sin matches</h3><p>¡Tu match está por ahí en León!</p><button class="btn btn-primary" onclick="document.querySelector('[data-s=discovery]').click()" style="max-width:220px;margin-top:1.5rem">Descubrir perfiles 💫</button></div>`;
        return;
      }
      const otherIds = [...new Set(matchData.map(m => m.user1_id === user.id ? m.user2_id : m.user1_id))];
      const { data: profData } = await sb.from('profiles').select('*').in('user_id', otherIds);
      const profMap = {};
      (profData || []).forEach(p => profMap[p.user_id] = p);
      const enriched = matchData.map(m => {
        const oid = m.user1_id === user.id ? m.user2_id : m.user1_id;
        return { ...m, _other: profMap[oid] || null };
      }).filter(m => m._other);
      countLabel.textContent = `${enriched.length} match${enriched.length !== 1 ? 'es' : ''}`;
      const frag = document.createDocumentFragment();
      enriched.forEach(m => {
        const p = m._other;
        const isVerified = p.verification_status === 'approved';
        const card = document.createElement('div');
        card.className = 'match-card' + (isVerified ? ' verified-match' : '');
        card.innerHTML = `${p.photo_url ? `<img src="${p.photo_url}" class="match-card-img" alt="${escapeHtml(p.name)}" draggable="false" loading="lazy">` : `<div class="match-card-no-photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`}<div class="match-card-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><div class="match-card-overlay"><div class="match-card-name">${escapeHtml(p.name || '?')}</div><div class="match-card-meta">${[p.gender, p.age ? p.age + ' años' : ''].filter(Boolean).join(' · ') || 'León, Gto'}</div></div><div class="match-card-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></div>`;
        card.addEventListener('click', () => { renderViewMatchProfile(p, 'matches'); showScreen('view-match-profile'); });
        frag.appendChild(card);
      });
      grid.innerHTML = '';
      grid.appendChild(frag);
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--c-muted)">Error al cargar matches</div>`;
    }
  }

  /* ════════════════════════════════════════════════════
     10. CONVERSACIONES
  ════════════════════════════════════════════════════ */
  async function loadConvos() {
    const list = document.getElementById('conv-list');
    list.innerHTML = ['','',''].map(() => `<div class="conv-skeleton"><div class="skel skel-av"></div><div class="skel-lines"><div class="skel skel-line1"></div><div class="skel skel-line2"></div></div></div>`).join('');

    const { data: msgData, error } = await sb.from('messages')
      .select('id,sender_id,receiver_id,content,status,created_at')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) { console.error('loadConvos error:', error); list.innerHTML = ''; return; }

    const otherIdsSet = new Set();
    (msgData || []).forEach(msg => {
      const oid = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      otherIdsSet.add(oid);
    });
    const otherIds = [...otherIdsSet];
    let profMap = {};
    if (otherIds.length) {
      const { data: profData } = await sb.from('profiles')
        .select('user_id,name,photo_url,age,gender,verification_status').in('user_id', otherIds);
      (profData || []).forEach(p => profMap[p.user_id] = p);
    }

    const map = new Map();
    (msgData || []).forEach(msg => {
      const oid = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!map.has(oid)) map.set(oid, { u: profMap[oid] || null, msgs: [], hasActive: false, hasPending: false, hasRequest: false, hasRejected: false, requestMsg: null });
      const conv = map.get(oid);
      conv.msgs.push(msg);
      if      (msg.status === 'active')   conv.hasActive = true;
      else if (msg.status === 'rejected' && msg.sender_id === user.id) conv.hasRejected = true;
      else if (msg.status === 'pending') {
        if (msg.sender_id === user.id) conv.hasPending = true;
        else { conv.hasRequest = true; conv.requestMsg = msg; }
      }
    });

    convos = Array.from(map.values()).filter(cv => !trashedConvos.has(cv.u?.user_id));
    _lastConvosLoad = Date.now();
    renderConvos();
  }

  function renderConvos() {
    const list = document.getElementById('conv-list');
    list.innerHTML = '';
    // Re-aplicar filtro de papelera sobre el array en memoria
    // (necesario cuando se mueve a papelera sin hacer re-fetch)
    const visibleConvos = convos.filter(cv => !trashedConvos.has(cv.u?.user_id));
    if (!visibleConvos.length) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><h3>Sin conversaciones</h3><p>Cuando hagas match aparecerán aquí</p></div>`;
      return;
    }
    const requests      = visibleConvos.filter(cv => cv.hasRequest && !cv.hasActive);
    const activeConvs   = visibleConvos.filter(cv => cv.hasActive);
    const pendingConvs  = visibleConvos.filter(cv => !cv.hasActive && !cv.hasRequest && cv.hasPending && !cv.hasRejected);
    const rejectedConvs = visibleConvos.filter(cv => cv.hasRejected && !cv.hasActive);

    const frag = document.createDocumentFragment();
    if (requests.length) {
      const label = document.createElement('div'); label.className = 'section-label'; label.innerHTML = '💌 Solicitudes recibidas'; frag.appendChild(label);
      requests.forEach(cv => frag.appendChild(buildRequestCard(cv)));
    }
    if (activeConvs.length) {
      const label = document.createElement('div'); label.className = 'section-label'; label.style.marginTop = requests.length ? '1.25rem' : '0'; label.textContent = 'Chats activos'; frag.appendChild(label);
      activeConvs.forEach(cv => frag.appendChild(buildConvItem(cv, 'active')));
    }
    if (pendingConvs.length) {
      const label = document.createElement('div'); label.className = 'section-label'; label.style.marginTop = '1.25rem'; label.textContent = '⏳ Esperando respuesta'; frag.appendChild(label);
      pendingConvs.forEach(cv => frag.appendChild(buildConvItem(cv, 'pending')));
    }
    if (rejectedConvs.length) {
      const label = document.createElement('div'); label.className = 'section-label'; label.style.marginTop = '1.25rem'; label.textContent = '❌ Sin match'; frag.appendChild(label);
      rejectedConvs.forEach(cv => frag.appendChild(buildConvItem(cv, 'rejected')));
    }
    list.appendChild(frag);
  }

  function buildRequestCard(cv) {
    const msg = cv.requestMsg;
    const div = document.createElement('div');
    div.className = 'request-card';
    const avHtml = cv.u?.photo_url
      ? `<img src="${cv.u.photo_url}" class="req-av" alt="${escapeHtml(cv.u?.name || '')}" loading="lazy">`
      : `<div class="req-av-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    div.innerHTML = `<div class="request-card-head">${avHtml}<div class="req-info"><h4>${escapeHtml(cv.u?.name || '—')}</h4><p>${[cv.u?.gender, cv.u?.age ? cv.u.age + ' años' : ''].filter(Boolean).join(' · ') || 'León, Gto'}</p></div></div><div class="req-msg">"${escapeHtml(msg?.content || '')}"</div><div class="req-actions"><button class="btn btn-danger" data-reject="${msg?.id}" data-sender="${cv.u?.user_id}">✕ Rechazar</button><button class="btn btn-success" data-accept="${msg?.id}" data-sender="${cv.u?.user_id}">✓ Aceptar</button></div>`;
    div.querySelector('[data-accept]').addEventListener('click', async function () { this.classList.add('loading'); await acceptRequest(this.dataset.sender, parseInt(this.dataset.accept)); });
    div.querySelector('[data-reject]').addEventListener('click', async function () { this.classList.add('loading'); await rejectRequest(this.dataset.sender, parseInt(this.dataset.reject)); });
    return div;
  }

  function buildConvItem(cv, type) {
    const lastMsg    = cv.msgs[0];
    const isPending  = type === 'pending';
    const isRejected = type === 'rejected';
    const isActive   = type === 'active';
    const div = document.createElement('div');
    div.className = 'conv-item' + (isPending ? ' pending-conv' : '') + (isRejected ? ' rejected-conv' : '');
    const avHtml = cv.u?.photo_url
      ? `<img src="${cv.u.photo_url}" class="conv-av" alt="${escapeHtml(cv.u?.name || '')}" loading="lazy">`
      : `<div class="conv-av-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    const dotHtml = isPending  ? '<div class="pending-dot"></div>'
                  : isRejected ? '<div class="rejected-dot"></div>'
                  :              '<div class="online-dot"></div>';
    const lastTxt = isPending  ? `<span class="conv-last pending-tag">⏳ Esperando que ${escapeHtml(cv.u?.name?.split(' ')[0] || '')} responda</span>`
                  : isRejected ? `<span class="conv-last rejected-tag">❌ No hubo match</span>`
                  :              `<p class="conv-last">${escapeHtml(lastMsg?.content || '')}</p>`;
    const deleteBtn = isRejected ? `<button class="delete-conv-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : '';
    const trashBtn  = isActive   ? `<button class="trash-conv-btn" title="Eliminar" style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.22);color:#f87171;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;pointer-events:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>` : '';
    div.innerHTML = `<div class="av-wrap">${avHtml}${dotHtml}</div><div class="conv-info"><div class="conv-top"><span class="conv-name">${escapeHtml(cv.u?.name || '—')}</span><span class="conv-time">${fmtTime(lastMsg?.created_at)}</span></div>${lastTxt}</div><div style="display:flex;align-items:center;gap:.25rem">${trashBtn}${deleteBtn}</div>`;
    if (isActive) {
      div.addEventListener('click', e => { if (e.target.closest('.trash-conv-btn')) return; openChat(cv.u, true, 'messages'); });
      const tb = div.querySelector('.trash-conv-btn');
      if (tb) tb.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await showConfirm({ icon: '🗑️', title: 'Eliminar conversación', msg: `Los mensajes con ${escapeHtml(cv.u?.name?.split(' ')[0] || '')} se ocultarán. El match se conserva.`, okText: 'Eliminar', okColor: '#f87171' });
        if (!ok) return;
        trashedConvos.add(cv.u.user_id);
        saveTrash();
        updateTrashBadge();
        // Actualizar array en memoria para que renderConvos refleje el cambio inmediatamente
        convos = convos.filter(c => c.u?.user_id !== cv.u.user_id);
        renderConvos();
        toast('Conversación eliminada 🗑️', 'ok');
      });
    }
    if (isRejected) {
      const db = div.querySelector('.delete-conv-btn');
      if (db) db.addEventListener('click', e => { e.stopPropagation(); deleteRejectedConv(cv.u.user_id); });
    }
    return div;
  }

  async function acceptRequest(senderId, msgId) {
    try {
      await sb.from('messages').update({ status: 'active' }).eq('id', msgId);
      const u1 = user.id < senderId ? user.id : senderId;
      const u2 = user.id < senderId ? senderId : user.id;
      await sb.from('matches').upsert({ user1_id: u1, user2_id: u2, created_at: new Date().toISOString() }, { onConflict: 'user1_id,user2_id' });
      await sb.from('messages').update({ status: 'active' }).eq('sender_id', user.id).eq('receiver_id', senderId).eq('status', 'pending');
      toast('¡Match aceptado! 🎉', 'ok');
      Promise.all([loadMatches(), loadConvos()]);
    } catch (err) { console.error(err); toast('Error al aceptar', 'err'); }
  }

  async function rejectRequest(senderId, msgId) {
    try {
      await sb.from('messages').update({ status: 'rejected' }).eq('id', msgId);
      await sb.from('likes').upsert({ user_id: user.id, liked_user_id: senderId, is_like: false, created_at: new Date().toISOString() }, { onConflict: 'user_id,liked_user_id' });
      toast('Solicitud rechazada', 'ok'); loadConvos();
    } catch (err) { console.error(err); toast('Error', 'err'); }
  }

  async function deleteRejectedConv(oid) {
    try {
      await sb.from('messages').delete().or(`and(sender_id.eq.${user.id},receiver_id.eq.${oid}),and(sender_id.eq.${oid},receiver_id.eq.${user.id})`);
      // Actualizar array en memoria antes del re-fetch para UI instantánea
      convos = convos.filter(c => c.u?.user_id !== oid);
      renderConvos();
      toast('Conversación eliminada', 'ok'); loadConvos();
    } catch { toast('Error al eliminar', 'err'); }
  }

  /* ════════════════════════════════════════════════════
     11. PAPELERA
  ════════════════════════════════════════════════════ */
  function saveTrash() {
    try { localStorage.setItem('lionmatch_trash', JSON.stringify([...trashedConvos])); } catch { /* storage lleno */ }
  }

  function updateTrashBadge() {
    const badge = document.getElementById('trash-badge'); if (!badge) return;
    const count = trashedConvos.size;
    badge.style.display = count > 0 ? '' : 'none';
    badge.textContent = count;
  }

  async function renderTrashScreen() {
    const list = document.getElementById('trash-list'); if (!list) return;
    if (!trashedConvos.size) {
      list.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:var(--c-muted)"><p style="font-size:2.5rem;margin-bottom:.75rem">🗑️</p><p style="font-weight:700;color:var(--c-text);margin-bottom:.4rem">Papelera vacía</p><p style="font-size:.85rem">Los chats que elimines aparecerán aquí</p></div>`;
      return;
    }
    list.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--c-muted);font-size:.85rem">Cargando...</div>`;
    const uids = [...trashedConvos];
    const { data: profs } = await sb.from('profiles').select('user_id,name,photo_url').in('user_id', uids);
    const profMap = {};
    (profs || []).forEach(p => profMap[p.user_id] = p);
    const frag = document.createDocumentFragment();
    uids.forEach(uid => {
      const prof = profMap[uid]; if (!prof) return;
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--c-card);border:1px solid var(--c-border);border-radius:var(--r3);padding:1rem;margin-bottom:.75rem;display:flex;gap:.85rem;align-items:center';
      const avHtml = prof.photo_url
        ? `<img src="${prof.photo_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;flex-shrink:0;opacity:.7" loading="lazy">`
        : `<div style="width:50px;height:50px;border-radius:50%;background:var(--c-panel);flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:.7"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
      div.innerHTML = avHtml + `<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--c-text);margin-bottom:.2rem">${escapeHtml(prof.name || '—')}</div><div style="font-size:.8rem;color:var(--c-muted)">Conversación oculta</div></div><div style="display:flex;flex-direction:column;gap:.5rem;flex-shrink:0"><button class="trash-restore-btn" style="padding:.4rem .75rem;border-radius:var(--r1);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25);color:#34d399;font-size:.75rem;font-weight:700;cursor:pointer;font-family:var(--font-b)">↩ Restaurar</button><button class="trash-delete-btn" style="padding:.4rem .75rem;border-radius:var(--r1);background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.2);color:#f87171;font-size:.75rem;font-weight:700;cursor:pointer;font-family:var(--font-b)">🗑 Eliminar</button></div>`;
      div.querySelector('.trash-restore-btn').addEventListener('click', () => {
        trashedConvos.delete(uid); saveTrash(); updateTrashBadge();
        toast('Chat restaurado ✓', 'ok'); loadConvos(); renderTrashScreen();
      });
      div.querySelector('.trash-delete-btn').addEventListener('click', async () => {
        const ok = await showConfirm({ icon: '🗑️', title: 'Eliminar definitivamente', msg: '¿Eliminar este chat para siempre? Esta acción no se puede deshacer.', okText: 'Eliminar', okColor: '#f87171' });
        if (!ok) return;
        trashedConvos.delete(uid); saveTrash(); updateTrashBadge(); renderTrashScreen();
        toast('Chat eliminado 🗑️', 'ok');
      });
      frag.appendChild(div);
    });
    list.innerHTML = '';
    list.appendChild(frag);
  }

  /* ════════════════════════════════════════════════════
     12. CHAT
  ════════════════════════════════════════════════════ */
  async function openChat(u, isActive, fromScreen = 'messages') {
    prevChatScreen = fromScreen;
    showScreen('chat');
    currentChatUserId   = u.user_id;
    currentChatIsActive = isActive;
    try {
      const { data: fullProfile } = await sb.from('profiles').select('*').eq('user_id', u.user_id).maybeSingle();
      currentChatUserProfile = fullProfile || u;
    } catch { currentChatUserProfile = u; }
    const p = currentChatUserProfile;
    document.getElementById('chat-user-name').textContent = p.name || u.name;
    const statusEl = document.getElementById('chat-user-status');
    if (statusEl) {
      const vStatus = p.verification_status || 'none';
      if (vStatus === 'approved') { statusEl.textContent = '✓ Verificado'; statusEl.className = 'chat-verify-status verified'; }
      else { statusEl.textContent = 'Cuenta no verificada aún'; statusEl.className = 'chat-verify-status unverified'; }
    }
    initBellBtn(u.user_id);
    const wrap = document.getElementById('chat-av-wrap');
    const photoUrl = p.photo_url || u.photo_url;
    if (photoUrl) {
      wrap.innerHTML = ''; wrap.className = 'chat-av-wrap-img';
      const img = document.createElement('img'); img.src = photoUrl; img.className = 'chat-av'; img.alt = p.name || '';
      img.loading = 'lazy';
      wrap.appendChild(img);
    } else {
      wrap.className = 'chat-av-ph';
      wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
    loadChatMsgs(u.user_id);
    const inp     = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    inp.disabled     = !isActive;
    sendBtn.disabled = !isActive;
    inp.placeholder  = isActive ? 'Escribe un mensaje…' : 'Chat bloqueado hasta el Match ⏳';
    if (isActive) { startChatRealtime(u.user_id); updateBlockUI(u.user_id); }
  }

  function initBellBtn(targetId) {
    const key  = `notif_chat_${targetId}`;
    const btn  = document.getElementById('chat-bell-btn');
    const icon = document.getElementById('chat-bell-icon');
    if (!btn || !icon) return;
    const isOn = localStorage.getItem(key) !== 'off';
    updateBellUI(isOn, btn, icon);
    btn.onclick = async () => {
      const currentOn = localStorage.getItem(key) !== 'off';
      const newState  = !currentOn;
      try { localStorage.setItem(key, newState ? 'on' : 'off'); } catch { /* storage lleno */ }
      updateBellUI(newState, btn, icon);
      toast(newState ? 'Notificaciones activadas 🔔' : 'Notificaciones silenciadas 🔕', 'ok');
    };
  }

  function updateBellUI(isOn, btn, icon) {
    if (isOn) {
      icon.setAttribute('fill', 'rgba(167,139,250,.9)');
      icon.setAttribute('stroke', 'rgba(167,139,250,.9)');
      btn.style.color = 'rgba(167,139,250,.9)';
      btn.title = 'Notificaciones activadas — toca para silenciar';
    } else {
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'var(--c-muted)');
      btn.style.color = 'var(--c-muted)';
      btn.title = 'Notificaciones silenciadas — toca para activar';
    }
  }

  function maybeNotify(msg, senderProfile) {
    const key  = `notif_chat_${msg.sender_id}`;
    const isOn = localStorage.getItem(key) !== 'off';
    if (!isOn) return;
    if (document.visibilityState === 'visible' && currentChatUserId === msg.sender_id) return;
    const name = senderProfile?.name || 'Nuevo mensaje';
    // Notificación personalizada in-app (sin popup nativo del navegador)
    const titleEl = document.getElementById('m-notif-title');
    const msgEl   = document.getElementById('m-notif-msg');
    if (titleEl) titleEl.textContent = `💬 ${name}`;
    if (msgEl)   msgEl.textContent   = msg.content.length > 60 ? msg.content.slice(0, 60) + '…' : msg.content;
    openModal('m-notif');
    // Guardar sender para el botón "Ver chat"
    window._notifSenderId = msg.sender_id;
    window._notifSenderProfile = senderProfile;
  }

  async function loadChatMsgs(oid) {
    const c = document.getElementById('chat-msgs');
    c.innerHTML = `<div class="msgs-skeleton"><div class="sk-bubble sk-them"></div><div class="sk-bubble sk-me"></div><div class="sk-bubble sk-them sk-short"></div><div class="sk-bubble sk-me sk-short"></div></div>`;
    const { data } = await sb.from('messages')
      .select('id,sender_id,receiver_id,content,created_at,status')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${oid}),and(sender_id.eq.${oid},receiver_id.eq.${user.id})`)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    c.innerHTML = '';
    if (!data || !data.length) {
      c.innerHTML = `<div class="empty-chat-state"><p style="font-size:1.5rem">🎉</p><p style="font-weight:700;color:var(--c-text)">¡Match desbloqueado!</p><p style="color:var(--c-muted);font-size:.86rem">Digan hola y comiencen a conocerse</p></div>`;
    } else {
      const frag = document.createDocumentFragment();
      data.forEach(msg => {
        const d = document.createElement('div');
        d.className = `msg-row ${msg.sender_id === user.id ? 'me' : 'them'}`;
        d.innerHTML = `<div class="bubble">${escapeHtml(msg.content)}</div>`;
        frag.appendChild(d);
      });
      c.appendChild(frag);
    }
    c.scrollTop = c.scrollHeight;
  }

  function appendMessage(msg) {
    const c = document.getElementById('chat-msgs'); if (!c) return;
    const empty = c.querySelector('.empty-chat-state'); if (empty) empty.remove();
    const d = document.createElement('div');
    d.className = `msg-row ${msg.sender_id === user.id ? 'me' : 'them'}`;
    d.innerHTML = `<div class="bubble">${escapeHtml(msg.content)}</div>`;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
  }

  async function sendMessage() {
    if (!currentChatIsActive) { toast('Primero necesitas hacer Match 💫', 'info'); return; }
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if (!txt || !currentChatUserId) return;
    inp.value = '';
    try {
      const { data, error } = await sb.from('messages').insert({
        sender_id: user.id, receiver_id: currentChatUserId,
        content: txt, status: 'active', created_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      appendMessage(data);
    } catch { toast('Error al enviar', 'err'); inp.value = txt; }
  }

  /* ════════════════════════════════════════════════════
     13. BLOQUEOS
  ════════════════════════════════════════════════════ */
  async function checkBlocked(targetId) {
    try {
      const { data, error } = await sb.from('blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', targetId).maybeSingle();
      if (error) console.warn('[blocks] checkBlocked error:', error.message);
      return !!data;
    } catch (e) { console.warn('[blocks] checkBlocked exception:', e); return false; }
  }

  async function blockUser(targetId) {
    try {
      const { error } = await sb.from('blocks').insert({ blocker_id: user.id, blocked_id: targetId });
      if (error) throw error;
      toast('Usuario bloqueado 🚫', 'ok');
    } catch (e) { console.error('[blocks] blockUser:', e); toast('Error al bloquear: ' + (e.message || ''), 'err'); }
  }

  async function unblockUser(targetId) {
    try {
      const { error } = await sb.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', targetId);
      if (error) throw error;
      toast('Usuario desbloqueado ✓', 'ok');
    } catch (e) { console.error('[blocks] unblockUser:', e); toast('Error al desbloquear: ' + (e.message || ''), 'err'); }
  }

  async function updateBlockUI(targetId) {
    const isBlocked = await checkBlocked(targetId);
    const label = document.getElementById('chat-block-label');
    if (label) label.textContent = isBlocked ? 'Desbloquear' : 'Bloquear';
    const btn = document.getElementById('chat-block-btn');
    if (btn) btn.style.color = isBlocked ? '#34d399' : '#f87171';
    const inp     = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    if (isBlocked) {
      if (inp)     { inp.disabled = true; inp.placeholder = 'Chat desactivado — usuario bloqueado'; }
      if (sendBtn) sendBtn.disabled = true;
    } else {
      if (inp)     { inp.disabled = false; inp.placeholder = 'Escribe un mensaje…'; }
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function handleBlockToggle() {
    if (!currentChatUserProfile?.user_id) return;
    const uid       = currentChatUserProfile.user_id;
    const isBlocked = await checkBlocked(uid);
    if (isBlocked) {
      const ok = await showConfirm({ icon: '🔓', title: '¿Desbloquear usuario?', msg: 'Podrás volver a enviarte mensajes mutuamente.', okText: 'Sí, desbloquear', okColor: '#34d399', stripeColor: 'linear-gradient(90deg,#34d399,#10b981)' });
      if (!ok) return;
      await unblockUser(uid);
    } else {
      const ok = await showConfirm({ icon: '🚫', title: '¿Bloquear usuario?', msg: 'No podrás enviarle mensajes ni él a ti.', okText: 'Sí, bloquear', okColor: '#f87171' });
      if (!ok) return;
      await blockUser(uid);
    }
    await updateBlockUI(uid);
  }

  /* ════════════════════════════════════════════════════
     14. VERIFICACIÓN
  ════════════════════════════════════════════════════ */
  function renderVerifyScreen() {
    const p       = user?.profile || {};
    const status  = p.verification_status || 'none';
    const content = document.getElementById('verify-content');
    if (status === 'approved') {
      content.innerHTML = `<div class="verify-status-card approved-st"><p style="font-size:2.5rem;margin-bottom:.75rem">✅</p><h3 style="font-family:var(--font-h);font-size:1.25rem;color:var(--c-green);margin-bottom:.4rem">¡Ya estás verificado!</h3><p style="color:var(--c-muted);font-size:.88rem">Tu perfil muestra la palomita verde.</p></div>`; return;
    }
    if (status === 'pending') {
      content.innerHTML = `<div class="verify-status-card pending-st"><p style="font-size:2.5rem;margin-bottom:.75rem">⏳</p><h3 style="font-family:var(--font-h);font-size:1.25rem;color:var(--c-gold);margin-bottom:.4rem">Solicitud en revisión</h3><p style="color:var(--c-muted);font-size:.88rem">Tu selfie fue enviada. La revisaremos pronto.</p></div>`; return;
    }
    if (status === 'rejected') {
      content.innerHTML = `<div class="verify-status-card rejected-st" style="margin-bottom:1rem"><p style="font-size:2rem;margin-bottom:.5rem">❌</p><h3 style="font-family:var(--font-h);font-size:1.1rem;color:var(--c-red);margin-bottom:.3rem">Selfie rechazada</h3><p style="color:var(--c-muted);font-size:.83rem">Intenta de nuevo con buena iluminación.</p></div>${buildVerifyUploadForm()}`;
      initVerifyUpload(); return;
    }
    content.innerHTML = `<div class="verify-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg><h3>Sube una selfie</h3><p>Tómate una foto haciendo un pulgar arriba 👍 La compararemos con tu foto de perfil.</p></div>${buildVerifyUploadForm()}`;
    initVerifyUpload();
  }

  function buildVerifyUploadForm() {
    return `<div style="text-align:center"><div class="verify-photo-zone" id="verify-zone"><input type="file" id="verify-photo-input" accept="image/*" capture="user"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span>Toca para selfie</span></div><p id="verify-photo-name" style="color:var(--c-muted);font-size:.78rem;margin:.5rem 0 1rem"></p><button class="btn btn-success" id="verify-submit-btn" style="max-width:280px;margin:0 auto" disabled>Enviar para verificación ✓</button></div>`;
  }

  function initVerifyUpload() {
    verifyPhotoDataURL = null;
    const inp = document.getElementById('verify-photo-input');
    const btn = document.getElementById('verify-submit-btn');
    if (!inp || !btn) return;
    inp.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast('Foto max 8 MB', 'err'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        verifyPhotoDataURL = ev.target.result;
        document.getElementById('verify-photo-name').textContent = '📸 Foto lista — ' + file.name;
        const zone = document.getElementById('verify-zone');
        zone.querySelectorAll('img.vp').forEach(i => i.remove());
        const img = document.createElement('img'); img.src = verifyPhotoDataURL; img.className = 'vp';
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:1;';
        zone.appendChild(img); btn.disabled = false;
      };
      reader.readAsDataURL(file);
    });
    btn.addEventListener('click', submitVerification);
  }

  async function submitVerification() {
    if (!verifyPhotoDataURL) { toast('Selecciona una foto', 'err'); return; }
    const btn = document.getElementById('verify-submit-btn');
    btn.classList.add('loading');
    try {
      const res = await fetch(verifyPhotoDataURL); const blob = await res.blob();
      const ext  = blob.type.split('/')[1] || 'jpg';
      const path = `verif_${user.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('verifications').upload(path, blob, { upsert: true, contentType: blob.type });
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from('verifications').getPublicUrl(path);
      const { error } = await sb.from('profiles').update({
        verification_status: 'pending', verification_photo_url: urlData.publicUrl,
        verification_requested_at: new Date().toISOString(),
      }).eq('user_id', user.id);
      if (error) throw error;
      await loadProfile(); toast('Selfie enviada ✓ Revisaremos pronto', 'ok'); renderVerifyScreen();
    } catch (err) { console.error(err); toast('Error: ' + err.message, 'err'); }
    finally { btn.classList.remove('loading'); }
  }

  /* ════════════════════════════════════════════════════
     15. PANEL ADMIN
  ════════════════════════════════════════════════════ */
  async function loadAdminPanel() {
    if (user?.email !== ADMIN_EMAIL) { toast('Acceso denegado', 'err'); return; }
    const list = document.getElementById('admin-list');
    list.innerHTML = `<p style="color:var(--c-muted);text-align:center;padding:2rem">Cargando…</p>`;
    const { data, error } = await sb.from('profiles').select('*').eq('verification_status', 'pending').order('verification_requested_at', { ascending: true });
    if (error || !data || !data.length) {
      list.innerHTML = `<div class="admin-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg><p>Sin solicitudes pendientes 🎉</p></div>`;
      updateAdminBadge(0); return;
    }
    updateAdminBadge(data.length); list.innerHTML = '';
    const frag = document.createDocumentFragment();
    data.forEach(profile => frag.appendChild(buildAdminCard(profile)));
    list.appendChild(frag);
  }

  function updateAdminBadge(count) {
    ['admin-count-badge', 'sb-admin-badge'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      if (count > 0) { el.style.display = ''; el.textContent = count; } else el.style.display = 'none';
    });
  }

  function buildAdminCard(profile) {
    const div = document.createElement('div');
    div.className = 'admin-card';
    const avHtml = profile.photo_url
      ? `<img src="${profile.photo_url}" class="admin-av" alt="${escapeHtml(profile.name || '')}" loading="lazy">`
      : `<div class="admin-av-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
    const requestedAt = profile.verification_requested_at ? new Date(profile.verification_requested_at).toLocaleString('es-MX') : '—';
    div.innerHTML = `<div class="admin-card-head">${avHtml}<div><div style="font-weight:700;color:var(--c-text)">${escapeHtml(profile.name || 'Sin nombre')}</div><div style="font-size:.76rem;color:var(--c-muted)">${escapeHtml(profile.email || '')}</div><div style="font-size:.72rem;color:var(--c-dim);margin-top:.2rem">Solicitado: ${requestedAt}</div></div></div><p style="font-size:.78rem;color:var(--c-muted);margin-bottom:.75rem">Foto de perfil ↑ · Selfie de verificación ↓</p>${profile.verification_photo_url ? `<img src="${profile.verification_photo_url}" class="admin-verif-photo" alt="Selfie" loading="lazy">` : `<div style="background:var(--c-panel);border-radius:var(--r2);padding:1.5rem;text-align:center;color:var(--c-muted);margin-bottom:.875rem;font-size:.83rem">Sin foto adjunta</div>`}<div class="admin-actions"><button class="btn btn-danger" data-action="reject">✕ Rechazar</button><button class="btn btn-success" data-action="approve">✓ Aprobar</button></div>`;
    div.querySelector('[data-action="approve"]').addEventListener('click', async function () { this.classList.add('loading'); await adminReviewVerification(profile.user_id, 'approved'); loadAdminPanel(); });
    div.querySelector('[data-action="reject"]').addEventListener('click',  async function () { this.classList.add('loading'); await adminReviewVerification(profile.user_id, 'rejected'); loadAdminPanel(); });
    return div;
  }

  async function adminReviewVerification(profileUserId, decision) {
    try {
      await sb.from('profiles').update({
        verification_status: decision, verified: decision === 'approved',
        verification_reviewed_at: new Date().toISOString(), verification_reviewed_by: user.id,
      }).eq('user_id', profileUserId);
      toast(decision === 'approved' ? '✅ Perfil verificado' : '❌ Solicitud rechazada', decision === 'approved' ? 'ok' : 'err');
    } catch (err) { toast('Error: ' + err.message, 'err'); }
  }

  /* ════════════════════════════════════════════════════
     16. PERFIL — CARGA Y RENDER
  ════════════════════════════════════════════════════ */
  async function loadProfile() {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('loadProfile timeout')), 5000)
      );
      const query = sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      const { data, error } = await Promise.race([query, timeout]);
      if (error) throw error;
      user.profile = data || null;
    } catch (err) { user.profile = null; throw err; }
  }

  // ─── Helper compartido para no repetir el bloque lifestyle/música/intereses ──
  function _renderProfileFields(p, ids) {
    // Lifestyle
    const lifestyleCard = document.getElementById(ids.lifestyleCard);
    const lifestyleWrap = document.getElementById(ids.lifestyleWrap);
    if (lifestyleWrap) {
      lifestyleWrap.innerHTML = '';
      const pills = [];
      if (p.profession) pills.push({ icon: '💼', label: p.profession });
      if (p.smokes)     pills.push({ icon: '🚬', label: p.smokes });
      if (p.drinks)     pills.push({ icon: '🍻', label: p.drinks });
      if (pills.length) {
        const frag = document.createDocumentFragment();
        pills.forEach(pl => {
          const span = document.createElement('span'); span.className = 'lifestyle-pill';
          span.textContent = `${pl.icon} ${pl.label}`; frag.appendChild(span);
        });
        lifestyleWrap.appendChild(frag);
        if (lifestyleCard) lifestyleCard.style.display = '';
      } else {
        if (lifestyleCard) lifestyleCard.style.display = 'none';
      }
    }
    // Música
    const musicCard = document.getElementById(ids.musicCard);
    const musicEl   = document.getElementById(ids.musicEl);
    if (musicEl) {
      if (p.music_genre) { musicEl.textContent = '🎵 ' + p.music_genre; if (musicCard) musicCard.style.display = ''; }
      else { if (musicCard) musicCard.style.display = 'none'; }
    }
    // Intereses
    const intWrap = document.getElementById(ids.intWrap);
    if (intWrap) {
      intWrap.innerHTML = '';
      if (p.interests) {
        const d = document.createElement('div'); d.className = 'interest-badges';
        const frag = document.createDocumentFragment();
        p.interests.split(',').map(s => s.trim()).filter(Boolean).forEach(item => {
          const span = document.createElement('span'); span.className = 'interest-badge'; span.textContent = item; frag.appendChild(span);
        });
        d.appendChild(frag);
        intWrap.appendChild(d);
      } else {
        intWrap.innerHTML = '<p style="color:var(--c-muted);font-size:.9rem">—</p>';
      }
    }
    // Stats (edad, género)
    const stats = document.getElementById(ids.stats);
    if (stats) {
      stats.innerHTML = '';
      const frag = document.createDocumentFragment();
      if (p.age)    { const pill = document.createElement('div'); pill.className = 'stat-pill age-pill'; pill.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${p.age} años`; frag.appendChild(pill); }
      if (p.gender) { const pill = document.createElement('div'); pill.className = 'stat-pill gender-pill'; pill.textContent = (p.gender === 'Mujer' ? '♀' : '♂') + ' ' + p.gender; frag.appendChild(pill); }
      stats.appendChild(frag);
    }
    // Fotos extra
    const photoRow = document.getElementById(ids.photoRow);
    if (photoRow) {
      photoRow.innerHTML = '';
      const frag = document.createDocumentFragment();
      [p.photo2_url, p.photo3_url, p.photo4_url].forEach(url => {
        if (url) {
          const img = document.createElement('img'); img.src = url; img.className = 'profile-photo-mini'; img.loading = 'lazy';
          img.addEventListener('click', () => openLightbox(url)); frag.appendChild(img);
        }
      });
      photoRow.appendChild(frag);
    }
  }

  function renderProfile() {
    const p = user.profile || {};
    const vStatus = p.verification_status || 'none';
    const vBadge  = vStatus === 'approved' ? '<span class="verify-badge verified">✓ Verificado</span>'
                  : vStatus === 'pending'  ? '<span class="verify-badge pending">⏳ En revisión</span>'
                  :                          '<span class="verify-badge none">Sin verificar</span>';
    document.getElementById('prof-name').innerHTML  = escapeHtml(p.name || '—') + vBadge;
    document.getElementById('prof-bio').textContent = p.bio || 'Sin biografía';
    document.getElementById('prof-seeking').textContent = p.seeking || '—';
    const paraCol = document.getElementById('prof-para-col');
    if (p.relation) { document.getElementById('prof-relation').textContent = p.relation; paraCol.style.display = ''; }
    else paraCol.style.display = 'none';

    _renderProfileFields(p, {
      lifestyleCard: 'prof-card-lifestyle', lifestyleWrap: 'prof-lifestyle',
      musicCard: 'prof-card-music', musicEl: 'prof-music',
      intWrap: 'prof-interests', stats: 'prof-stats', photoRow: 'prof-extra-photos',
    });

    const wrap = document.getElementById('prof-av-wrap');
    if (wrap && p.photo_url) {
      wrap.className = 'profile-avatar-ph profile-av-loading';
      const img = new Image();
      img.onload = () => { wrap.className = ''; wrap.innerHTML = `<img src="${p.photo_url}" class="profile-avatar" alt="Foto" loading="eager">`; };
      img.src = p.photo_url;
    }
  }

  function renderViewMatchProfile(p) {
    document.getElementById('view-match-header-name').textContent = p.name || 'Perfil';
    const wrap = document.getElementById('view-match-av-wrap');
    if (p.photo_url) { wrap.className = ''; wrap.innerHTML = `<img src="${p.photo_url}" class="profile-avatar" alt="${escapeHtml(p.name || '')}">`; }
    else             { wrap.className = 'profile-avatar-ph'; wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`; }
    const vBadge = p.verification_status === 'approved' ? '<span class="verify-badge verified">✓ Verificado</span>'
                 : p.verification_status === 'pending'  ? '<span class="verify-badge pending">⏳ En revisión</span>' : '';
    document.getElementById('view-match-name').innerHTML = escapeHtml(p.name || '—') + vBadge;
    document.getElementById('view-match-bio').textContent     = p.bio || 'Sin biografía';
    document.getElementById('view-match-seeking').textContent = p.seeking || '—';
    const vmParaCol = document.getElementById('view-match-para-col');
    if (p.relation) { document.getElementById('view-match-relation').textContent = p.relation; vmParaCol.style.display = ''; }
    else vmParaCol.style.display = 'none';

    _renderProfileFields(p, {
      lifestyleCard: 'view-match-card-lifestyle', lifestyleWrap: 'view-match-lifestyle',
      musicCard: 'view-match-card-music', musicEl: 'view-match-music',
      intWrap: 'view-match-interests', stats: 'view-match-stats', photoRow: 'view-match-extra-photos',
    });

    currentChatUserProfile = p;
    updateBlockUI(p.user_id);
  }

  /* ════════════════════════════════════════════════════
     17. PERFIL — EDICIÓN Y ONBOARDING
  ════════════════════════════════════════════════════ */
  function fillEditForm() {
    const p = user.profile || {};
    deletedSlots = {}; photoDataURL = null; photoDataURL2 = null; photoDataURL3 = null; photoDataURL4 = null;
    document.getElementById('edit-name').value         = p.name         || '';
    document.getElementById('edit-birth').value        = p.birthdate    || '';
    document.getElementById('edit-gender').value       = p.gender       || '';
    document.getElementById('edit-bio').value          = p.bio          || '';
    document.getElementById('edit-seeking').value      = p.seeking      || '';
    document.getElementById('edit-age-min').value      = p.age_min      || '';
    document.getElementById('edit-age-max').value      = p.age_max      || '';
    document.getElementById('edit-relation').value     = p.relation     || '';
    document.getElementById('edit-profession').value   = p.profession   || '';
    document.getElementById('edit-smokes').value       = p.smokes       || '';
    document.getElementById('edit-drinks').value       = p.drinks       || '';
    document.getElementById('edit-music-genre').value  = p.music_genre  || '';
    const n = (p.bio || '').length;
    const editCounter = document.getElementById('edit-bio-counter');
    if (editCounter) {
      if (n >= 200) { editCounter.className = 'char-count req-ok';      editCounter.innerHTML = `<span id="edit-bio-n">${n}</span>/300 ✓`; }
      else          { editCounter.className = 'char-count req-warning'; editCounter.innerHTML = `<span id="edit-bio-n">${n}</span>/300 — necesitas al menos 200`; }
    }
    document.querySelectorAll('#edit-seeking-chips .chip[data-v]').forEach(c   => c.classList.toggle('on', c.dataset.v  === p.seeking));
    document.querySelectorAll('#edit-relation-chips .chip[data-v3]').forEach(c => c.classList.toggle('on', c.dataset.v3 === p.relation));
    if (p.seeking) document.getElementById('edit-age-range-section').classList.add('show');
    else           document.getElementById('edit-age-range-section').classList.remove('show');
    loadInterestChipsFrom(p.interests || '', 'edit-interest-chips');
    const zone = document.getElementById('photo-zone-edit');
    zone.querySelectorAll('img.preview-img').forEach(i => i.remove());
    zone.querySelector('.upload-hint').style.display = '';
    if (p.photo_url) {
      const img = document.createElement('img'); img.src = p.photo_url; img.className = 'preview-img';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      zone.insertBefore(img, zone.querySelector('.upload-hint'));
      zone.querySelector('.upload-hint').style.display = 'none';
    }
    ['mini-zone-edit-2', 'mini-zone-edit-3', 'mini-zone-edit-4'].forEach((zid, i) => {
      const z = document.getElementById(zid); if (!z) return;
      z.querySelectorAll('img.mini-preview').forEach(im => im.remove());
      z.querySelector('svg')?.style.removeProperty('display');
      z.querySelector('span.mini-label')?.style.removeProperty('display');
      z.classList.remove('has-photo');
      const url = [p.photo2_url, p.photo3_url, p.photo4_url][i];
      if (url) setMiniPreview(zid, url);
    });
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!validateEditForm()) return;
    const p = user.profile || {};
    if (!p.photo_url && !photoDataURL) { toast('Agrega una foto de perfil', 'err'); return; }
    const btn = e.target.querySelector('[type=submit]');
    btn.classList.add('loading');
    try {
      const birth = document.getElementById('edit-birth').value;
      let photo_url  = p.photo_url  || null;
      let photo2_url = deletedSlots[2] ? null : (p.photo2_url || null);
      let photo3_url = deletedSlots[3] ? null : (p.photo3_url || null);
      let photo4_url = deletedSlots[4] ? null : (p.photo4_url || null);
      if (photoDataURL)  photo_url  = await uploadPhoto(photoDataURL,  '');
      if (photoDataURL2) photo2_url = await uploadPhoto(photoDataURL2, '_2');
      if (photoDataURL3) photo3_url = await uploadPhoto(photoDataURL3, '_3');
      if (photoDataURL4) photo4_url = await uploadPhoto(photoDataURL4, '_4');
      const { error } = await sb.from('profiles').upsert({
        user_id: user.id, email: user.email,
        name:       document.getElementById('edit-name').value.trim(),
        birthdate:  birth || null,
        age:        birth ? calcAge(birth) : p.age || null,
        gender:     document.getElementById('edit-gender').value,
        bio:        document.getElementById('edit-bio').value,
        seeking:    document.getElementById('edit-seeking').value,
        age_min:    parseInt(document.getElementById('edit-age-min').value) || null,
        age_max:    parseInt(document.getElementById('edit-age-max').value) || null,
        relation:   document.getElementById('edit-relation').value,
        interests:  document.getElementById('edit-interests').value,
        profession:   document.getElementById('edit-profession').value.trim() || null,
        smokes:       document.getElementById('edit-smokes').value || null,
        drinks:       document.getElementById('edit-drinks').value || null,
        music_genre:  document.getElementById('edit-music-genre').value || null,
        photo_url, photo2_url, photo3_url, photo4_url,
        location: 'León, Guanajuato', updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      await loadProfile();
      photoDataURL = null; photoDataURL2 = null; photoDataURL3 = null; photoDataURL4 = null; deletedSlots = {};
      toast('Perfil actualizado ✓', 'ok');
      showScreen('profile'); renderProfile();
    } catch (err) { console.error(err); toast('Error: ' + err.message, 'err'); }
    finally { btn.classList.remove('loading'); }
  }

  function validateEditForm() {
    const name  = document.getElementById('edit-name').value.trim();
    const bio   = document.getElementById('edit-bio').value.trim();
    const birth = document.getElementById('edit-birth').value;
    if (!name)                        { toast('El nombre es requerido', 'err'); return false; }
    if (!birth)                       { toast('La fecha de nacimiento es requerida', 'err'); return false; }
    if (calcAge(birth) < 18)          { toast('Debes ser mayor de 18 años', 'err'); return false; }
    if (bio.length < 50)             { toast(`La descripción necesita al menos 50 caracteres (tienes ${bio.length})`, 'err'); return false; }
    if (selectedInterests.length < 3) { toast('Selecciona al menos 3 intereses', 'err'); return false; }
    return true;
  }

  async function handleDelete() {
    try {
      stopRealtime();
      await sb.from('profiles').delete().eq('user_id', user.id);
      await sb.from('likes').delete().or(`user_id.eq.${user.id},liked_user_id.eq.${user.id}`);
      await sb.from('matches').delete().or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);
      await sb.from('messages').delete().or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
      await sb.auth.signOut();
      window._bootDone = false; user = null;
      closeModal('m-delete'); closeSidebar(); showScreen('login');
      toast('Cuenta eliminada');
    } catch { toast('Error al eliminar', 'err'); }
  }

  function obUpdateUI() {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.step[data-step="${obStep}"]`).classList.add('active');
    document.getElementById('ob-prog').style.width = `${(obStep / 3) * 100}%`;
    document.getElementById('ob-prev').style.display   = obStep > 1 ? '' : 'none';
    document.getElementById('ob-next').style.display   = obStep < 3 ? '' : 'none';
    document.getElementById('ob-finish').style.display = obStep === 3 ? '' : 'none';
  }

  function obNext() {
    if (obStep === 1) {
      const name  = document.getElementById('ob-name').value.trim();
      const birth = document.getElementById('ob-birth').value;
      if (!name)               { toast('El nombre es requerido', 'err'); return; }
      if (!photoDataURL)       { toast('Por favor sube una foto de perfil', 'err'); return; }
      if (!birth)              { toast('La fecha de nacimiento es requerida', 'err'); return; }
      if (calcAge(birth) < 18) { document.getElementById('ob-birth-msg').style.display = 'block'; toast('Debes ser mayor de 18 años', 'err'); return; }
      document.getElementById('ob-birth-msg').style.display = 'none';
    }
    if (obStep < 3) { obStep++; obUpdateUI(); }
  }

  function obPrev() { if (obStep > 1) { obStep--; obUpdateUI(); } }

  function validateObStep3() {
    const bio      = document.getElementById('ob-bio').value.trim();
    const intCount = selectedInterests.length;
    if (bio.length < 50) { toast(`La descripción necesita al menos 50 caracteres (tienes ${bio.length})`, 'err'); return false; }
    if (intCount < 3)     { toast(`Selecciona al menos 3 intereses (tienes ${intCount})`, 'err'); return false; }
    return true;
  }

  async function handleCompleteProfile(e) {
    e.preventDefault();
    if (!validateObStep3()) return;
    const name  = document.getElementById('ob-name').value.trim();
    const birth = document.getElementById('ob-birth').value;
    if (!name)                        { toast('El nombre es requerido', 'err'); return; }
    if (!photoDataURL)                { toast('Por favor sube una foto de perfil', 'err'); return; }
    if (!birth || calcAge(birth) < 18){ toast('Debes ser mayor de 18 años', 'err'); return; }
    const btn = document.getElementById('ob-finish');
    btn.classList.add('loading');
    try {
      const photo_url  = await uploadPhoto(photoDataURL, '');
      const photo2_url = photoDataURL2 ? await uploadPhoto(photoDataURL2, '_2') : null;
      const photo3_url = photoDataURL3 ? await uploadPhoto(photoDataURL3, '_3') : null;
      const photo4_url = photoDataURL4 ? await uploadPhoto(photoDataURL4, '_4') : null;
      const { error } = await sb.from('profiles').upsert({
        user_id: user.id, email: user.email, name,
        birthdate: birth || null, age: calcAge(birth),
        gender:     document.getElementById('ob-gender').value,
        seeking:    document.getElementById('ob-seeking').value,
        bio:        document.getElementById('ob-bio').value || '',
        interests:  document.getElementById('ob-interests').value || '',
        relation:   document.getElementById('ob-relation').value || '',
        age_min:    parseInt(document.getElementById('ob-age-min').value) || null,
        age_max:    parseInt(document.getElementById('ob-age-max').value) || null,
        profession:   document.getElementById('ob-profession').value.trim() || null,
        smokes:       document.getElementById('ob-smokes').value || null,
        drinks:       document.getElementById('ob-drinks').value || null,
        music_genre:  document.getElementById('ob-music-genre').value || null,
        photo_url, photo2_url, photo3_url, photo4_url,
        location: 'León, Guanajuato', updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      await loadProfile();
      photoDataURL = null; photoDataURL2 = null; photoDataURL3 = null; photoDataURL4 = null;
      toast('¡Perfil completado!', 'ok');
      showScreen('discovery'); loadProfiles(); startRealtimeMessages();
    } catch (err) { console.error(err); toast('Error al guardar: ' + err.message, 'err'); }
    finally { btn.classList.remove('loading'); }
  }

  function openLightbox(url) {
    const lb  = document.getElementById('photo-lightbox');
    const img = document.getElementById('lb-img');
    if (!lb || !img) return;
    img.src = url; lb.classList.add('open'); document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const lb = document.getElementById('photo-lightbox');
    if (lb) lb.classList.remove('open');
    document.body.style.overflow = '';
  }
  // FIX CRÍTICO: el HTML usa onclick="closeLightbox()" en atributos inline
  // que buscan la función en el scope global. Sin esto, el botón ✕ no funciona.
  window.closeLightbox = closeLightbox;

  /* ════════════════════════════════════════════════════
     18. UI HELPERS
  ════════════════════════════════════════════════════ */
  let _toastTimer = null;
  function toast(msg, type = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `toast ${type}`; t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date(), diff = now - d;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dd = Math.floor(diff / 86400000);
    if (m < 1)  return 'Ahora';
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (dd < 7) return `${dd}d`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  function calcAge(birth) {
    const t = new Date(), b = new Date(birth);
    let a = t.getFullYear() - b.getFullYear();
    const mo = t.getMonth() - b.getMonth();
    if (mo < 0 || (mo === 0 && t.getDate() < b.getDate())) a--;
    return a;
  }

  /* ════════════════════════════════════════════════════
     19. MODALES
  ════════════════════════════════════════════════════ */
  function openModal(id)  { document.getElementById(id)?.classList.add('on'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('on'); }

  function showError(msg, title = 'Error') {
    document.getElementById('m-error-title').textContent = title;
    document.getElementById('m-error-msg').textContent   = msg;
    openModal('m-error');
  }

  function showSuccess(msg, title = '¡Listo!', cb = null) {
    document.getElementById('m-success-title').textContent = title;
    document.getElementById('m-success-msg').textContent   = msg;
    window._successCb = cb;
    openModal('m-success');
  }

  function showConfirm({ icon = '⚠️', title = '¿Estás seguro?', msg = '', okText = 'Confirmar', okColor = '#f87171', stripeColor = null } = {}) {
    return new Promise(resolve => {
      document.getElementById('m-confirm-title').textContent = title;
      document.getElementById('m-confirm-msg').textContent   = msg;
      const okBtn     = document.getElementById('m-confirm-ok');
      const cancelBtn = document.getElementById('m-confirm-cancel');
      okBtn.textContent = okText; okBtn.style.color = okColor;
      if (stripeColor) document.getElementById('m-confirm-stripe').style.background = stripeColor;
      openModal('m-confirm');
      okBtn.addEventListener('click',     () => { closeModal('m-confirm'); resolve(true);  }, { once: true });
      cancelBtn.addEventListener('click', () => { closeModal('m-confirm'); resolve(false); }, { once: true });
    });
  }

  function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(ov => {
      ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
    });
    document.getElementById('m-error-ok').addEventListener('click',   () => closeModal('m-error'));
    document.getElementById('m-success-ok').addEventListener('click', () => {
      closeModal('m-success');
      if (window._successCb) { window._successCb(); window._successCb = null; }
    });
    document.getElementById('rec-cancel').addEventListener('click', () => closeModal('m-recovery'));
    document.getElementById('rec-send').addEventListener('click',   handleRecovery);
    document.getElementById('del-cancel').addEventListener('click', () => closeModal('m-delete'));
    document.getElementById('del-confirm').addEventListener('click', handleDelete);
    document.getElementById('match-later').addEventListener('click', () => closeModal('m-match'));
    document.getElementById('match-chat-btn').addEventListener('click', () => {
      closeModal('m-match'); showScreen('messages'); Promise.all([loadMatches(), loadConvos()]);
    });
  }

  /* ════════════════════════════════════════════════════
     20. INTERESES
  ════════════════════════════════════════════════════ */
  function buildInterestChips() {
    ['ob-interest-chips', 'edit-interest-chips'].forEach(cid => {
      const c = document.getElementById(cid); if (!c) return;
      const frag = document.createDocumentFragment();
      INTERESTS_LIST.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'int-chip'; btn.dataset.interest = item.label;
        btn.textContent = item.emoji + ' ' + item.label;
        btn.addEventListener('click', () => toggleInterest(btn, cid));
        frag.appendChild(btn);
      });
      c.appendChild(frag);
    });
  }

  function toggleInterest(btn, cid) {
    const val = btn.dataset.interest;
    if (btn.classList.contains('on')) {
      btn.classList.remove('on');
      selectedInterests = selectedInterests.filter(i => i !== val);
    } else {
      if (selectedInterests.length >= 8) { toast('Máximo 8 intereses', 'err'); return; }
      btn.classList.add('on'); selectedInterests.push(val);
    }
    const ctxId   = cid.replace('-interest-chips', '');
    const countEl = document.getElementById(ctxId + '-int-count');
    if (countEl) {
      const n = selectedInterests.length;
      countEl.textContent = n + ' / 8 seleccionados';
      countEl.style.color = n >= 3 ? 'var(--c-green)' : 'var(--c-accent3)';
    }
    const hidEl = document.getElementById(ctxId + '-interests');
    if (hidEl) hidEl.value = selectedInterests.join(', ');
  }

  function loadInterestChipsFrom(str, cid) {
    selectedInterests = str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
    const c = document.getElementById(cid); if (!c) return;
    c.querySelectorAll('.int-chip').forEach(b => b.classList.toggle('on', selectedInterests.includes(b.dataset.interest)));
    const ctxId   = cid.replace('-interest-chips', '');
    const countEl = document.getElementById(ctxId + '-int-count');
    if (countEl) {
      countEl.textContent = selectedInterests.length + ' / 8 seleccionados';
      countEl.style.color = selectedInterests.length >= 3 ? 'var(--c-green)' : 'var(--c-accent3)';
    }
    const hidEl = document.getElementById(ctxId + '-interests');
    if (hidEl) hidEl.value = str || '';
  }

  /* ════════════════════════════════════════════════════
     21. CHIPS GENÉRICOS
  ════════════════════════════════════════════════════ */
  function initChips() {
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', function () {
        const grp = this.closest('.chips');
        ['v', 'v2', 'v3'].forEach(attr => {
          if (this.dataset[attr] !== undefined) {
            grp.querySelectorAll(`.chip[data-${attr}]`).forEach(c => c.classList.remove('on'));
            this.classList.add('on');
            const hid = grp.nextElementSibling;
            if (hid && hid.tagName === 'INPUT') hid.value = this.dataset[attr];
            if (attr === 'v') {
              const ageSection = document.getElementById('age-range-section') || document.getElementById('edit-age-range-section');
              if (ageSection) ageSection.classList.toggle('show', !!this.dataset.v);
            }
          }
        });
      });
    });
  }

  /* ════════════════════════════════════════════════════
     22. FOTOS
  ════════════════════════════════════════════════════ */
  function initPhotoUploads() {
    document.getElementById('photo-input-ob')?.addEventListener('change',   e => handleMainPhoto(e, 'photo-zone-ob'));
    document.getElementById('photo-input-edit')?.addEventListener('change', e => handleMainPhoto(e, 'photo-zone-edit'));
    [['ob',2],['ob',3],['ob',4],['edit',2],['edit',3],['edit',4]].forEach(([ctx, n]) => {
      document.getElementById(`photo-input-${ctx}-${n}`)?.addEventListener('change', e => handleMiniPhoto(e, `mini-zone-${ctx}-${n}`, n, ctx));
    });
  }

  function handleMainPhoto(e, zoneId) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Foto max 5 MB', 'err'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      photoDataURL = ev.target.result;
      const zone = document.getElementById(zoneId);
      zone.querySelectorAll('img.preview-img').forEach(i => i.remove());
      const img = document.createElement('img'); img.src = photoDataURL; img.className = 'preview-img';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;';
      zone.insertBefore(img, zone.querySelector('.upload-hint'));
      zone.querySelector('.upload-hint').style.display = 'none';
      toast('Foto principal cargada ✓', 'ok');
    };
    reader.readAsDataURL(file);
  }

  function handleMiniPhoto(e, zoneId, num, ctx) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Foto max 5 MB', 'err'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataURL = ev.target.result;
      if (num === 2) photoDataURL2 = dataURL;
      else if (num === 3) photoDataURL3 = dataURL;
      else if (num === 4) photoDataURL4 = dataURL;
      if (ctx === 'edit') delete deletedSlots[num];
      setMiniPreview(zoneId, dataURL);
      toast(`Foto ${num} cargada ✓`, 'ok');
    };
    reader.readAsDataURL(file);
  }

  function setMiniPreview(zoneId, url) {
    const zone = document.getElementById(zoneId); if (!zone) return;
    zone.querySelectorAll('img.mini-preview').forEach(i => i.remove());
    const img = document.createElement('img'); img.src = url; img.className = 'mini-preview';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;pointer-events:none;';
    zone.querySelector('svg')?.style.setProperty('display', 'none');
    zone.querySelector('span.mini-label')?.style.setProperty('display', 'none');
    const delBtn = zone.querySelector('.mini-del-btn');
    if (delBtn) zone.insertBefore(img, delBtn); else zone.insertBefore(img, zone.querySelector('input'));
    zone.classList.add('has-photo');
  }

  function clearMiniZone(zoneId, num, ctx) {
    const zone = document.getElementById(zoneId); if (!zone) return;
    zone.querySelectorAll('img.mini-preview').forEach(i => i.remove());
    zone.querySelector('svg')?.style.removeProperty('display');
    zone.querySelector('span.mini-label')?.style.removeProperty('display');
    zone.classList.remove('has-photo');
    if (num === 2) photoDataURL2 = null;
    else if (num === 3) photoDataURL3 = null;
    else if (num === 4) photoDataURL4 = null;
    if (ctx === 'edit') deletedSlots[num] = true;
    const inp = zone.querySelector('input[type=file]'); if (inp) inp.value = '';
    toast(`Foto ${num} eliminada`, 'ok');
  }

  function initMiniDeleteBtns() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.mini-del-btn'); if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const slot = parseInt(btn.dataset.slot), ctx = btn.dataset.ctx || 'ob';
      clearMiniZone(`mini-zone-${ctx}-${slot}`, slot, ctx);
    });
  }

  async function uploadPhoto(dataURL, suffix) {
    try {
      const res = await fetch(dataURL); const blob = await res.blob();
      const ext  = blob.type.split('/')[1] || 'jpg';
      const path = `avatars/${user.id}${suffix}.${ext}`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw error;
      const { data } = sb.storage.from('avatars').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) { console.warn('Storage fallback:', err); return dataURL; }
  }

  /* ════════════════════════════════════════════════════
     23. SIDEBAR
  ════════════════════════════════════════════════════ */
  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('on');
  }

  function initSidebar() {
    const sbar = document.getElementById('sidebar');
    const ov   = document.getElementById('overlay');
    const open = () => { sbar.classList.add('open'); ov.classList.add('on'); };
    document.querySelectorAll('#open-menu,#msg-menu,#prof-menu,#matches-menu').forEach(b => b.addEventListener('click', open));
    document.getElementById('close-sb').addEventListener('click', closeSidebar);
    ov.addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-item[data-s]').forEach(item => {
      item.addEventListener('click', () => {
        const s = item.dataset.s; closeSidebar();
        if      (s === 'discovery') { showScreen('discovery'); loadProfiles(); }
        else if (s === 'messages')  {
          showScreen('messages');
          // Solo recargar si los datos tienen más de 30s o están vacíos
          if (Date.now() - _lastConvosLoad > _CONVOS_TTL || !convos.length) {
            Promise.all([loadMatches(), loadConvos()]);
          } else {
            renderConvos(); // re-render instantáneo con datos en cache
          }
        }
        else if (s === 'profile')   { showScreen('profile');   renderProfile(); }
        else if (s === 'matches')   { showScreen('matches');   loadMatchesPage(); }
        else if (s === 'verify')    { showScreen('verify');    renderVerifyScreen(); }
        else if (s === 'admin')     { showScreen('admin');     loadAdminPanel(); }
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
    document.getElementById('nav-trash')?.addEventListener('click', () => {
      closeSidebar(); showScreen('trash'); renderTrashScreen();
    });
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
  }

  function showAdminIfNeeded() {
    const isAdmin  = user?.email === ADMIN_EMAIL;
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = isAdmin ? '' : 'none';
    // Actualizar sidebar con datos del usuario en sesión
    const nameEl   = document.getElementById('sb-user-name');
    const emailEl  = document.getElementById('sb-user-email');
    const avatarEl = document.getElementById('sb-avatar');
    if (nameEl)  nameEl.textContent  = user?.profile?.name || 'Mi cuenta';
    if (emailEl) emailEl.textContent = user?.email || '';
    if (avatarEl && user?.profile?.photo_url) {
      avatarEl.innerHTML = `<img src="${user.profile.photo_url}" alt="avatar">`;
    }
  }

  /* ════════════════════════════════════════════════════
     24. FORMULARIOS PRINCIPALES
  ════════════════════════════════════════════════════ */
  function initForms() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

    on('login-form',    'submit', handleLogin);
    on('go-register',   'click',  () => showScreen('register'));
    on('forgot-link',   'click',  () => { const r = document.getElementById('rec-email'); if (r) r.value = ''; openModal('m-recovery'); });
    on('back-login',    'click',  () => showScreen('login'));
    on('cancel-reg',    'click',  () => showScreen('login'));
    on('register-form', 'submit', handleRegister);

    // Políticas de seguridad
    on('security-btn',  'click',  () => openModal('m-security'));
    on('m-security-ok', 'click',  () => closeModal('m-security'));

    // Modal notificación personalizada
    on('m-notif-close', 'click',  () => closeModal('m-notif'));
    on('m-notif-open',  'click',  () => {
      closeModal('m-notif');
      if (window._notifSenderProfile) openChat(window._notifSenderProfile, true, 'messages');
    });

    on('back-ob',  'click',  handleLogout);
    on('ob-form',  'submit', handleCompleteProfile);
    on('ob-next',  'click',  obNext);
    on('ob-prev',  'click',  obPrev);

    on('like-btn',    'click', () => swipe('like'));
    on('dislike-btn', 'click', () => swipe('dislike'));
    on('super-btn',   'click', () => swipe('super'));

    initSolicitudModal();

    on('back-verify',     'click', () => goBack());
    on('back-admin',      'click', () => goBack());
    on('back-trash',      'click', () => goBack());
    on('wall-verify-btn', 'click', () => { showScreen('verify'); renderVerifyScreen(); });

    on('back-chat', 'click', () => {
      if (chatRealtimeChannel) { sb.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
      goBack();
    });

    on('send-btn',   'click',    sendMessage);
    on('chat-input', 'keypress', e => { if (e.key === 'Enter') sendMessage(); });

    on('edit-prof-btn', 'click',  () => { fillEditForm(); showScreen('edit'); });
    on('del-acc-btn',   'click',  () => openModal('m-delete'));
    on('back-edit',     'click',  () => goBack());
    on('cancel-edit',   'click',  () => goBack());
    on('edit-form',     'submit', handleUpdate);

    on('chat-view-profile-btn', 'click', () => {
      if (currentChatUserProfile) { renderViewMatchProfile(currentChatUserProfile, 'chat'); showScreen('view-match-profile'); }
    });

    const dotsBtn      = document.getElementById('chat-dots-btn');
    const chatDropdown = document.getElementById('chat-dropdown');
    dotsBtn?.addEventListener('click', e => {
      e.stopPropagation();
      if (chatDropdown) chatDropdown.style.display = chatDropdown.style.display !== 'none' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { if (chatDropdown) chatDropdown.style.display = 'none'; });
    on('chat-block-btn', 'click', () => {
      if (chatDropdown) chatDropdown.style.display = 'none';
      handleBlockToggle();
    });

    on('back-view-match',     'click', () => goBack());
    on('view-match-chat-btn', 'click', () => {
      if (currentChatUserProfile) openChat(currentChatUserProfile, true, 'view-match-profile');
    });
  }

  function initBioCounters() {
    const updateCounter = (inputId, counterId, minLen) => {
      const el = document.getElementById(inputId); if (!el) return;
      el.addEventListener('input', () => {
        const n = el.value.length;
        const counter = document.getElementById(counterId); if (!counter) return;
        counter.className = n >= minLen ? 'char-count req-ok' : 'char-count req-warning';
        counter.innerHTML = `<span>${n}</span>/300${n >= minLen ? ' ✓' : ` — necesitas al menos ${minLen}`}`;
      });
    };
    updateCounter('ob-bio',   'ob-bio-counter',   50);
    updateCounter('edit-bio', 'edit-bio-counter', 50);
  }

  function initTogglePw() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.toggle-pw'); if (!btn) return;
      e.preventDefault();
      const inp = document.getElementById(btn.dataset.target); if (!inp) return;
      const eo = btn.querySelector('.eye-o'), ec = btn.querySelector('.eye-c');
      if (inp.type === 'password') {
        inp.type = 'text';
        eo.style.display = 'none';
        ec.style.display = '';
      } else {
        inp.type = 'password';
        eo.style.display = '';
        ec.style.display = 'none';
      }
    });
  }

})();
