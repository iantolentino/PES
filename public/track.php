<?php
/** Public tracking endpoint: open pixel, unsubscribe, confirm. */
$root = dirname(__DIR__);
require_once $root . '/core/config_loader.php';
require_once $root . '/core/db.php';

$type = $_GET['t'] ?? '';
header('Access-Control-Allow-Origin: *');

function sendPixel() {
    header('Content-Type: image/gif');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit;
}

function track_page($title, $message, $success = true, $sub = ''){
    $brand = '#0F4C5C';
    $accent = '#1B9AAA';
    $successColor = '#1B5E36';
    $dangerColor = '#B00020';
    $icon = $success
        ? '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="'.($success?$successColor:$dangerColor).'" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>'
        : '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="'.($success?$successColor:$dangerColor).'" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="<?= $brand ?>">
<meta name="description" content="Strata Staff Global — Newsletter">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<title><?= htmlspecialchars($title) ?> — Strata Staff Global</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:linear-gradient(135deg, <?= $brand ?> 0%, #0a3540 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.2);padding:48px 40px;text-align:center;max-width:440px;width:100%;position:relative;overflow:hidden}
  .card::before{content:'';position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,<?= $accent ?>,<?= $brand ?>)}
  .icon-wrap{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;<?= $success ? 'background:#E7F3EC' : 'background:#FDECEC' ?>}
  .icon-wrap svg{width:36px;height:36px}
  h1{color:#1F2933;font-size:24px;font-weight:800;margin:0 0 12px;letter-spacing:-.3px}
  p{color:#6B7280;font-size:16px;line-height:1.6;margin:0 0 8px}
  .email{color:#0F4C5C;font-weight:700;font-size:15px;word-break:break-all}
  .footer-text{color:rgba(255,255,255,.5);font-size:12px;margin-top:24px;text-align:center}
  .btn{display:inline-block;margin-top:24px;padding:12px 24px;background:<?= $brand ?>;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;transition:background .2s,transform .2s}
  .btn:hover{background:<?= $brand ?>;transform:translateY(-1px)}
  @media(max-width:480px){
    .card{padding:36px 24px}
    h1{font-size:20px}
  }
</style>
</head>
<body>
  <div>
    <div class="card">
      <div class="icon-wrap">
        <?= $icon ?>
      </div>
      <h1><?= htmlspecialchars($title) ?></h1>
      <p><?= htmlspecialchars($message) ?></p>
      <?php if($sub): ?><p class="email"><?= htmlspecialchars($sub) ?></p><?php endif; ?>
      <a href="https://stratastaffglobal.com" class="btn">Visit Strata Staff Global</a>
    </div>
    <p class="footer-text">Strata Staff Global &mdash; Professional Strata Management Services</p>
  </div>
</body>
</html>
    <?php
    exit;
}

switch ($type) {
    case 'open':
        $id = (int)($_GET['id'] ?? 0);
        if ($id) {
            DB::run("UPDATE sends SET opened_at = COALESCE(opened_at, NOW()) WHERE id=?", [$id]);
            DB::run("INSERT INTO open_events (send_id, ip, user_agent) VALUES (?,?,?)",
                [$id, $_SERVER['REMOTE_ADDR'] ?? null, $_SERVER['HTTP_USER_AGENT'] ?? null]);
        }
        sendPixel();
        break;

    case 'unsub':
        $sid = (int)($_GET['s'] ?? 0);
        $tok = $_GET['tok'] ?? '';
        $sub = $sid ? DB::run("SELECT id, confirm_token, email FROM subscribers WHERE id=?", [$sid])->fetch() : null;
        if ($sub && hash_equals((string)$sub['confirm_token'], (string)$tok)) {
            DB::run("UPDATE subscribers SET status='unsubscribed' WHERE id=?", [$sid]);
            DB::run("UPDATE sends SET unsubscribed_at=NOW() WHERE subscriber_id=?", [$sid]);
            track_page("You've been unsubscribed", "You will no longer receive newsletters from us.", true, $sub['email']);
        } else {
            http_response_code(400);
            track_page("Invalid unsubscribe link", "The link you followed is invalid or has expired.", false);
        }
        break;

    case 'confirm':
        $sid = (int)($_GET['s'] ?? 0);
        $tok = $_GET['tok'] ?? '';
        $sub = $sid ? DB::run("SELECT id, confirm_token FROM subscribers WHERE id=?", [$sid])->fetch() : null;
        if ($sub && hash_equals((string)$sub['confirm_token'], (string)$tok)) {
            DB::run("UPDATE subscribers SET status='subscribed' WHERE id=?", [$sid]);
            track_page("Subscription confirmed", "Thank you for subscribing! You'll now receive our latest updates.", true);
        } else {
            http_response_code(400);
            track_page("Invalid confirmation link", "The link you followed is invalid or has expired.", false);
        }
        break;

    default:
        http_response_code(404);
        track_page("Page not found", "The tracking endpoint you requested does not exist.", false);
}
