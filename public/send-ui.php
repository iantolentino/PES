<?php
/** Web UI: add recipient emails, compose, and send EACH client an individual email. Auth-gated. */
require_once __DIR__ . '/auth.php';
auth_require();
$root = dirname(__DIR__);
require_once $root . '/core/config_loader.php';
require_once $root . '/core/db.php';
require_once $root . '/core/mailer.php';
require_once $root . '/core/tracking.php';

$msg = '';
$msgType = 'success';
$results = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'send') {
    $raw = trim($_POST['emails'] ?? '');
    $subject = trim($_POST['subject'] ?? 'Newsletter');
    $body = trim($_POST['body'] ?? '');
    $emails = preg_split('/[\s,;]+/', $raw, -1, PREG_SPLIT_NO_EMPTY);
    $emails = array_unique(array_filter($emails, fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));

    if (!$body) {
        $msg = 'Body is required.';
        $msgType = 'error';
    } elseif (empty($emails)) {
        $msg = 'No valid email addresses found.';
        $msgType = 'error';
    } else {
        $transport = config('mail.transport');
        $sent = $failed = 0;
        $rate = config('send.rate_per_sec', 5); $sleep = $rate > 0 ? (1/$rate) : 0;
        foreach ($emails as $email) {
            $html = decorate_body($body, 0, 'web', false);
            $html = str_replace('<!--OPENPIXEL-->', '', $html);
            $r = Mailer::send($email, '', $subject, $html);
            $results[] = ['email' => $email, 'ok' => $r['ok'], 'detail' => $r['detail']];
            $r['ok'] ? $sent++ : $failed++;
            if ($sleep > 0) usleep((int)($sleep*1_000_000));
        }
        $msg = "Sent $sent emails, $failed failed (transport: $transport). Each recipient received an individual email.";
        $msgType = $failed > 0 ? 'warn' : 'success';
    }
}

$previewBody = $_POST['body'] ?? '<h2>July 2026 Update</h2><p>Hi, here is our latest news...</p>';
$previewHtml = str_replace('<!--OPENPIXEL-->', '', decorate_body($previewBody, 0, 'web', false));

render_head('Send Newsletter');
?>
<div class="wrap">

  <div class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Newsletter Sender</h2>
        <p class="card-sub">From: <?= h(config('app.from_name').' <'.config('app.from_email').'>') ?> &middot; Transport: <?= h(config('mail.transport')) ?></p>
      </div>
    </div>

    <?php if ($msg): ?>
    <div class="msg msg-<?= $msgType ?>">
      <?php if($msgType==='success'): ?>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
      <?php elseif($msgType==='error'): ?>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <?php else: ?>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>
      <?php endif; ?>
      <?= h($msg) ?>
    </div>
    <?php endif; ?>

    <form method="post">
      <input type="hidden" name="action" value="send">

      <div class="form-group">
        <label for="emails">Recipient emails <span style="font-weight:400;color:var(--gray-400)">(one per line, or comma/semicolon separated)</span></label>
        <textarea id="emails" name="emails" rows="6" placeholder="client1@abodestrata.com.au&#10;client2@alldiscox.com.au"><?= h($_POST['emails'] ?? "iantolentino0110@gmail.com\nian@stratastaffglobal.com\nsirflukee@gmail.com") ?></textarea>
      </div>

      <div class="form-group">
        <label for="subject">Subject</label>
        <input type="text" id="subject" name="subject" value="<?= h($_POST['subject'] ?? 'Strata Staff Global — July Update') ?>">
      </div>

      <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px">
        <div class="form-group">
          <label for="body">Email body <span style="font-weight:400;color:var(--gray-400)">(HTML allowed)</span></label>
          <textarea id="body" name="body" rows="14" style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px"><?= h($previewBody) ?></textarea>
          <p style="font-size:12px;color:var(--gray-400);margin:6px 0 0">Tip: Use HTML tags like &lt;h2&gt;, &lt;p&gt;, &lt;a&gt;, &lt;img&gt; for rich formatting.</p>
        </div>
        <div class="form-group">
          <label>Live preview <span style="font-weight:400;color:var(--gray-400)">(styled template)</span></label>
          <div class="preview"><?= $previewHtml ?></div>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" style="margin-top:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        Send to each client individually
      </button>
    </form>
  </div>

  <?php if ($results): ?>
  <div class="card" style="margin-top:20px">
    <div class="card-header">
      <div>
        <h2 class="card-title">Delivery Results</h2>
        <p class="card-sub">Status of each individual email sent</p>
      </div>
      <span class="pill pill-<?= array_sum(array_column($results,'ok'))===count($results)?'subscribed':'flagged' ?>">
        <?= array_sum(array_column($results,'ok')) ?>/<?= count($results) ?> sent
      </span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Status</th><th>Email</th><th>Detail</th></tr>
        </thead>
        <tbody>
          <?php foreach ($results as $r): ?>
          <tr>
            <td>
              <?php if($r['ok']): ?>
                <span class="pill pill-subscribed"><span class="pill-dot" style="background:var(--success)"></span>Sent</span>
              <?php else: ?>
                <span class="pill pill-unsubscribed"><span class="pill-dot" style="background:var(--danger)"></span>Failed</span>
              <?php endif; ?>
            </td>
            <td><?= h($r['email']) ?></td>
            <td style="color:<?= $r['ok']?'var(--gray-400)':'var(--danger)' ?>"><?= h($r['detail'] ?? '—') ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
  <?php endif; ?>

</div>
<style>
  .form-group{margin-bottom:16px}
  .form-group label{display:block;font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:6px}
  textarea,input[type=text]{width:100%;padding:12px 14px;border:1px solid var(--gray-300);border-radius:8px;font-size:14px;font-family:inherit;color:var(--gray-900);background:#fff;transition:border-color var(--transition),box-shadow var(--transition)}
  textarea:focus,input[type=text]:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(27,154,170,.12)}
  textarea{resize:vertical;min-height:100px}
  .preview{border:1px solid var(--gray-200);border-radius:8px;background:#fff;overflow:auto;max-height:520px;padding:16px}
  @media(max-width:800px){.two{grid-template-columns:1fr !important}}
</style>
<?php render_footer(); ?>
