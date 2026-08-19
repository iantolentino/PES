<?php
/** Minimal dashboard: subscriber + campaign stats. Auth-gated. */
require_once __DIR__ . '/auth.php';
auth_require();
if (($_GET['action'] ?? '') === 'logout') { auth_logout(); header('Location: login.php'); exit; }
$root = dirname(__DIR__);
require_once $root . '/core/config_loader.php';
require_once $root . '/core/db.php';

$subs = DB::run("SELECT status, COUNT(*) c, SUM(flagged) flagged FROM subscribers GROUP BY status")->fetchAll();
$total = array_sum(array_column($subs, 'c'));
$byStatus = [];
foreach ($subs as $r) $byStatus[$r['status']] = $r;

$camps = DB::run("SELECT c.id, c.name, c.status,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id=c.id) total,
    (SELECT SUM(status='sent') FROM sends s WHERE s.campaign_id=c.id) sent,
    (SELECT SUM(opened_at IS NOT NULL) FROM sends s WHERE s.campaign_id=c.id) opened,
    (SELECT SUM(unsubscribed_at IS NOT NULL) FROM sends s WHERE s.campaign_id=c.id) unsub
    FROM campaigns c ORDER BY c.id DESC")->fetchAll();

// Status colors for campaigns
function status_pill($status){
    $map = ['draft'=>'pill-draft','queued'=>'pill-queued','sending'=>'pill-queued','sent'=>'pill-sent','archived'=>'pill-archived'];
    $class = $map[$status] ?? 'pill-draft';
    $dot = $status === 'sent' ? '#1B5E36' : ($status === 'queued' || $status === 'sending' ? '#1565C0' : ($status === 'archived' ? '#9CA3AF' : '#8B5E00'));
    return '<span class="pill '.$class.'"><span class="pill-dot" style="background:'.$dot.'"></span>'.ucfirst($status).'</span>';
}

render_head('Dashboard');
?>
<div class="wrap">

  <!-- Stats Cards -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value"><?= number_format($total) ?></div>
      <div class="stat-label">Total Subscribers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--success)"><?= number_format($byStatus['subscribed']['c'] ?? 0) ?></div>
      <div class="stat-label">Active</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--danger)"><?= number_format($byStatus['unsubscribed']['c'] ?? 0) ?></div>
      <div class="stat-label">Unsubscribed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--warn)"><?= number_format(array_sum(array_column($subs, 'flagged'))) ?></div>
      <div class="stat-label">Flagged / Review</div>
    </div>
  </div>

  <!-- Campaigns -->
  <div class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Campaigns</h2>
        <p class="card-sub">All newsletter campaigns and their delivery metrics</p>
      </div>
      <a href="send-ui.php" class="btn btn-primary btn-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        New Campaign
      </a>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th style="text-align:right">Queued</th>
            <th style="text-align:right">Sent</th>
            <th style="text-align:right">Read</th>
            <th style="text-align:right">Unsub</th>
            <th style="text-align:right">Open Rate</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach($camps as $c):
            $openPct = ($c['sent']>0) ? round(100*$c['opened']/$c['sent'],1).'%' : '—';
            $openColor = ($c['sent']>0 && 100*$c['opened']/$c['sent'] >= 25) ? 'var(--success)' : (($c['sent']>0 && 100*$c['opened']/$c['sent'] >= 10) ? 'var(--warn)' : 'var(--gray-400)');
          ?>
          <tr>
            <td><strong>#<?= $c['id'] ?></strong></td>
            <td><?= h($c['name']) ?></td>
            <td><?= status_pill($c['status']) ?></td>
            <td style="text-align:right"><?= number_format($c['total']) ?></td>
            <td style="text-align:right"><?= number_format($c['sent']) ?></td>
            <td style="text-align:right"><?= number_format($c['opened']) ?></td>
            <td style="text-align:right"><?= number_format($c['unsub']) ?></td>
            <td style="text-align:right;font-weight:700;color:<?= $openColor ?>"><?= $openPct ?></td>
          </tr>
          <?php endforeach; ?>
          <?php if(empty($camps)): ?>
          <tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:32px">No campaigns yet. <a href="send-ui.php">Create your first campaign</a>.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

  <!-- CLI Quick Reference -->
  <div class="card">
    <div class="card-header">
      <div>
        <h2 class="card-title">CLI Quick Reference</h2>
        <p class="card-sub">Run these commands from the project root</p>
      </div>
    </div>
    <div style="background:var(--gray-900);color:#e2e8f0;border-radius:var(--radius-sm);padding:16px 20px;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;line-height:1.8;overflow-x:auto">
      <span style="color:var(--accent)">$</span> php cli/run.php install<br>
      <span style="color:var(--accent)">$</span> php cli/run.php import-pdf ../Downloads/"AU & CA Clients (July 2026).pdf"<br>
      <span style="color:var(--accent)">$</span> php cli/run.php campaign "July Update" "Subject here" body.html<br>
      <span style="color:var(--accent)">$</span> php cli/run.php queue 1<br>
      <span style="color:var(--accent)">$</span> php cli/run.php send --batch=50<br>
      <span style="color:var(--accent)">$</span> php cli/run.php stats
    </div>
  </div>

</div>
<?php render_footer(); ?>
