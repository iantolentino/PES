    </div>
  </div>
</div>

<div class="modal-overlay" id="logoutModal" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logoutModalTitle" aria-describedby="logoutModalDesc">
    <div class="modal-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </div>
    <h3 id="logoutModalTitle">Log out of your account?</h3>
    <p id="logoutModalDesc">You'll be returned to the sign-in screen and will need to enter your credentials again.</p>
    <div class="modal-actions">
      <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-danger" data-modal-confirm>Yes, log out</button>
    </div>
  </div>
</div>

<script>
(function () {
  var modal = document.getElementById('logoutModal');
  var trigger = document.getElementById('logoutTrigger');
  var form = document.getElementById('logoutForm');
  if (!modal || !trigger || !form) return;

  var lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var confirmBtn = modal.querySelector('[data-modal-confirm]');
    if (confirmBtn) confirmBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  trigger.addEventListener('click', openModal);

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  var closeBtn = modal.querySelector('[data-modal-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  var confirmBtn = modal.querySelector('[data-modal-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', function () { form.submit(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
})();
</script>
</body>
</html>
