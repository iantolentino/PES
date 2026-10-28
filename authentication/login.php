<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/bootstrap.php';

start_session_safe();
if (current_user()) {
    header('Location: ' . app_path('/frontend/admin/dashboard.php'));
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $email = trim((string)($_POST['email'] ?? ''));
    $password = (string)($_POST['password'] ?? '');
    $user = attempt_login($email, $password);
    if ($user) {
        audit(null, (int)$user['id'], $user['name'], 'user_login');
        header('Location: ' . app_path('/frontend/admin/dashboard.php'));
        exit;
    }
    $error = 'Invalid email or password.';
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign In — Performance Evaluation System</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --brand:#4f46e5; --brand-600:#4338ca; --ink:#0f172a; --ink-2:#334155;
    --muted:#64748b; --line:#e5e9f0; --bg:#f6f8fb;
    --danger:#b91c1c; --danger-bg:#fef2f2; --danger-line:#fecaca;
    --ring:0 0 0 3px rgba(79,70,229,.18);
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%}
  body{
    font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink); background:#fff; -webkit-font-smoothing:antialiased;
  }
  .login-shell{display:grid;grid-template-columns:1.05fr 1fr;min-height:100vh}

  /* Left brand panel */
  .brand-panel{
    position:relative;overflow:hidden;color:#fff;
    background:linear-gradient(150deg,#312e81 0%,#4338ca 45%,#4f46e5 100%);
    padding:56px 60px;display:flex;flex-direction:column;justify-content:space-between;
  }
  .brand-panel::before{
    content:"";position:absolute;width:520px;height:520px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.16),transparent 68%);
    top:-160px;right:-140px;
  }
  .brand-panel::after{
    content:"";position:absolute;width:420px;height:420px;border-radius:50%;
    background:radial-gradient(circle,rgba(14,165,233,.28),transparent 70%);
    bottom:-180px;left:-120px;
  }
  .brand-lockup{display:flex;align-items:center;gap:13px;position:relative;z-index:1}
  .brand-lockup .mark{
    width:46px;height:46px;border-radius:13px;background:rgba(255,255,255,.16);
    border:1px solid rgba(255,255,255,.28);
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;letter-spacing:.03em;
    backdrop-filter:blur(6px);
  }
  .brand-lockup .name{font-size:16px;font-weight:700;letter-spacing:-.01em}
  .brand-lockup .name small{display:block;font-size:11px;font-weight:500;color:rgba(255,255,255,.66);text-transform:uppercase;letter-spacing:.09em;margin-top:3px}
  .brand-hero{position:relative;z-index:1;max-width:430px}
  .brand-hero .eyebrow{
    font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
    color:#c7d2fe;margin-bottom:18px;
  }
  .brand-hero h1{
    font-size:42px;line-height:1.12;font-weight:800;letter-spacing:-.025em;margin:0 0 20px;
  }
  .brand-hero h1 span{color:#a5b4fc}
  .brand-hero p{font-size:14.5px;line-height:1.65;color:rgba(255,255,255,.74);margin:0;max-width:360px}
  .brand-foot{position:relative;z-index:1;font-size:12px;color:rgba(255,255,255,.5)}

  /* Right form panel */
  .form-panel{display:flex;align-items:center;justify-content:center;padding:40px 32px;background:#fff}
  .form-box{width:100%;max-width:392px}
  .form-box .head h2{font-size:27px;font-weight:750;letter-spacing:-.02em;margin:0 0 7px}
  .form-box .head p{font-size:13.5px;color:var(--muted);margin:0 0 30px}
  .field{margin-bottom:18px}
  .field label{display:block;font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:7px}
  .field input{
    width:100%;padding:11px 13px;border:1px solid #d3dae6;border-radius:9px;
    font-size:14px;font-family:inherit;color:var(--ink);background:#fff;
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .field input::placeholder{color:#9aa6b8}
  .field input:hover{border-color:#bfc9d8}
  .field input:focus{outline:none;border-color:var(--brand);box-shadow:var(--ring)}
  .signin-btn{
    width:100%;padding:12px;border:none;border-radius:9px;
    background:var(--brand);color:#fff;font-size:14.5px;font-weight:600;font-family:inherit;
    cursor:pointer;margin-top:8px;transition:background .15s ease,box-shadow .15s ease;
    box-shadow:0 4px 14px rgba(79,70,229,.28);
  }
  .signin-btn:hover{background:var(--brand-600);box-shadow:0 6px 20px rgba(79,70,229,.34)}
  .signin-btn:focus-visible{outline:none;box-shadow:var(--ring)}
  .error{
    display:flex;align-items:center;gap:9px;
    background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger-line);
    padding:11px 14px;border-radius:9px;font-size:13px;font-weight:500;margin-bottom:20px;
  }
  .error svg{width:17px;height:17px;flex-shrink:0}
  .form-foot{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);text-align:center}

  /* Responsive */
  @media (max-width:920px){
    .login-shell{grid-template-columns:1fr}
    .brand-panel{padding:36px 32px;min-height:auto}
    .brand-hero{margin:40px 0 8px}
    .brand-hero h1{font-size:32px}
    .brand-foot{display:none}
    .form-panel{padding:40px 24px}
  }
</style>
</head>
<body>
  <div class="login-shell">
    <aside class="brand-panel">
      <div class="brand-lockup">
        <div class="mark">PES</div>
        <div class="name">
          Performance Evaluation System
          <small>Internal Admin Portal</small>
        </div>
      </div>
      <div class="brand-hero">
        <div class="eyebrow">Employee Reviews</div>
        <h1>Evaluate fairly.<br>Approve faster.<br><span>Grow together.</span></h1>
        <p>Manage employee performance reviews, client evaluations, and approval workflows — all in one secure workspace.</p>
      </div>
      <div class="brand-foot">&copy; <?= date('Y') ?> Performance Evaluation System. Internal use only.</div>
    </aside>

    <main class="form-panel">
      <div class="form-box">
        <div class="head">
          <h2>Welcome back</h2>
          <p>Sign in to continue to your dashboard.</p>
        </div>
        <?php if ($error): ?>
          <div class="error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <?= e($error) ?>
          </div>
        <?php endif; ?>
        <form method="post">
          <?= csrf_field() ?>
          <div class="field">
            <label for="email">Email address</label>
            <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@company.com" value="<?= e($_POST['email'] ?? '') ?>">
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Enter your password">
          </div>
          <button class="signin-btn" type="submit">Sign in</button>
        </form>
        <div class="form-foot">
          Performance Evaluation System &mdash; Internal use only
        </div>
      </div>
    </main>
  </div>
</body>
</html>
