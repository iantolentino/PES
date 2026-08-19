<?php
/** Session-based admin gate. require_once this and call auth_require() at top of protected pages. */
$root = dirname(__DIR__);
require_once $root . '/core/config_loader.php';
config(); // load .env into getenv
if (session_status() === PHP_SESSION_NONE) session_start();

function h($s){ return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }

function auth_user(){
    return env('ADMIN_USER', 'admin');
}
function auth_hash(){
    return env('ADMIN_PASS_HASH', '');
}

function auth_check($user, $pass){
    return $user === auth_user() && password_verify($pass, auth_hash());
}

function auth_logged_in(){
    return !empty($_SESSION['admin_logged_in']);
}

function auth_require(){
    if (!auth_logged_in()) {
        $here = basename($_SERVER['PHP_SELF']);
        if ($here !== 'login.php') {
            header('Location: login.php');
            exit;
        }
    }
}

function auth_login($user, $pass){
    if (auth_check($user, $pass)) {
        $_SESSION['admin_logged_in'] = true;
        $_SESSION['admin_user'] = $user;
        return true;
    }
    return false;
}

function auth_logout(){
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time()-42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/** Return the current page filename for active nav highlighting. */
function current_page(){
    return basename($_SERVER['PHP_SELF']);
}

/** Shared HTML head + nav for all auth-gated pages. */
function render_head($title = 'Dashboard'){
    ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0F4C5C">
<meta name="description" content="Strata Staff Global — Newsletter Management">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<title><?= h($title) ?> — Strata Staff Global</title>
<style>
  :root{
    --brand:#0F4C5C;
    --brand-dark:#0a3540;
    --brand-light:#e6f0f2;
    --accent:#1B9AAA;
    --success:#1B5E36;
    --success-bg:#E7F3EC;
    --danger:#B00020;
    --danger-bg:#FDECEC;
    --warn:#8B5E00;
    --warn-bg:#FFF8E1;
    --gray-50:#F8FAFB;
    --gray-100:#F4F6F7;
    --gray-200:#E2E6E9;
    --gray-300:#D0D5DA;
    --gray-400:#9CA3AF;
    --gray-500:#6B7280;
    --gray-700:#374151;
    --gray-900:#1F2933;
    --shadow-sm:0 1px 2px rgba(0,0,0,.05);
    --shadow:0 4px 12px rgba(0,0,0,.08);
    --shadow-lg:0 10px 30px rgba(0,0,0,.12);
    --radius:10px;
    --radius-sm:6px;
    --transition:.2s ease;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--gray-100);color:var(--gray-900);line-height:1.5}
  a{color:var(--brand);text-decoration:none;transition:color var(--transition)}
  a:hover{color:var(--brand-dark)}
  /* Navbar */
  .navbar{background:var(--brand);padding:0 24px;position:sticky;top:0;z-index:100;box-shadow:var(--shadow)}
  .navbar-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:56px}
  .nav-brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:17px;letter-spacing:.3px}
  .nav-brand svg{width:24px;height:24px;fill:currentColor}
  .nav-links{display:flex;gap:4px}
  .nav-links a{color:rgba(255,255,255,.75);padding:8px 14px;border-radius:var(--radius-sm);font-size:14px;font-weight:500;transition:all var(--transition)}
  .nav-links a:hover{color:#fff;background:rgba(255,255,255,.1)}
  .nav-links a.active{color:#fff;background:rgba(255,255,255,.18)}
  .nav-user{display:flex;align-items:center;gap:12px;color:rgba(255,255,255,.8);font-size:13px}
  .nav-user a.logout{color:rgba(255,255,255,.6);font-size:13px;padding:4px 10px;border-radius:var(--radius-sm);border:1px solid rgba(255,255,255,.2);transition:all var(--transition)}
  .nav-user a.logout:hover{color:#fff;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35)}
  /* Layout */
  .wrap{max-width:1200px;margin:0 auto;padding:24px}
  /* Cards */
  .card{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow-sm);border:1px solid var(--gray-200);padding:24px;margin-bottom:20px;transition:box-shadow var(--transition)}
  .card:hover{box-shadow:var(--shadow)}
  .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
  .card-title{font-size:18px;font-weight:700;color:var(--gray-900);margin:0}
  .card-sub{font-size:13px;color:var(--gray-500);margin-top:2px}
  /* Stats grid */
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
  .stat-card{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow-sm);border:1px solid var(--gray-200);padding:20px;text-align:center;transition:transform var(--transition),box-shadow var(--transition)}
  .stat-card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
  .stat-value{font-size:32px;font-weight:800;color:var(--brand);line-height:1}
  .stat-label{font-size:13px;color:var(--gray-500);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
  .stat-change{font-size:12px;color:var(--gray-400);margin-top:4px}
  /* Tables */
  .table-wrap{overflow-x:auto;border-radius:var(--radius-sm);border:1px solid var(--gray-200)}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{background:var(--gray-50);color:var(--gray-500);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;padding:12px 16px;text-align:left;border-bottom:1px solid var(--gray-200);white-space:nowrap}
  td{padding:12px 16px;border-bottom:1px solid var(--gray-100);vertical-align:middle;color:var(--gray-700)}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:var(--gray-50)}
  /* Pills */
  .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:600;white-space:nowrap}
  .pill-dot{width:6px;height:6px;border-radius:50%;display:inline-block}
  .pill-draft{background:var(--warn-bg);color:var(--warn)}
  .pill-queued{background:#E3F2FD;color:#1565C0}
  .pill-sent{background:var(--success-bg);color:var(--success)}
  .pill-archived{background:var(--gray-100);color:var(--gray-500)}
  .pill-subscribed{background:var(--success-bg);color:var(--success)}
  .pill-unsubscribed{background:var(--danger-bg);color:var(--danger)}
  .pill-flagged{background:var(--warn-bg);color:var(--warn)}
  /* Buttons */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:all var(--transition);text-decoration:none}
  .btn-primary{background:var(--brand);color:#fff;border-color:var(--brand)}
  .btn-primary:hover{background:var(--brand-dark);border-color:var(--brand-dark);color:#fff}
  .btn-secondary{background:#fff;color:var(--brand);border-color:var(--gray-300)}
  .btn-secondary:hover{background:var(--gray-50);border-color:var(--gray-400)}
  .btn-sm{padding:6px 12px;font-size:13px}
  /* Messages */
  .msg{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--radius-sm);font-size:14px;margin-bottom:20px;border:1px solid transparent}
  .msg-success{background:var(--success-bg);color:var(--success);border-color:#B7DBC6}
  .msg-error{background:var(--danger-bg);color:var(--danger);border-color:#F5C2C2}
  .msg-warn{background:var(--warn-bg);color:var(--warn);border-color:#FFE082}
  /* Footer */
  .footer{text-align:center;padding:32px 24px;color:var(--gray-400);font-size:12px;border-top:1px solid var(--gray-200);margin-top:24px}
  /* Responsive */
  @media(max-width:640px){
    .navbar{padding:0 12px}
    .nav-links a{padding:6px 10px;font-size:13px}
    .wrap{padding:16px}
    .stats-grid{grid-template-columns:repeat(2,1fr)}
    .stat-value{font-size:24px}
  }
</style>
</head>
<body>
<?php if(auth_logged_in()): ?>
<nav class="navbar">
  <div class="navbar-inner">
    <a href="index.php" class="nav-brand">
      <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
      Strata Staff Global
    </a>
    <div class="nav-links">
      <a href="index.php" class="<?= current_page()==='index.php'?'active':'' ?>">Dashboard</a>
      <a href="send-ui.php" class="<?= current_page()==='send-ui.php'?'active':'' ?>">Send</a>
    </div>
    <div class="nav-user">
      <span><?= h($_SESSION['admin_user'] ?? 'Admin') ?></span>
      <a href="?action=logout" class="logout">Log out</a>
    </div>
  </div>
</nav>
<?php endif; ?>
<?php
}

/** Shared footer. Call before closing </body>. */
function render_footer(){
    ?>
<footer class="footer">
  Strata Staff Global &mdash; Newsletter Management System
</footer>
</body>
</html>
<?php
}
