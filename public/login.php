<?php
/** Admin login page. */
require_once __DIR__ . '/auth.php';

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $u = trim($_POST['user'] ?? '');
    $p = $_POST['pass'] ?? '';
    if (auth_login($u, $p)) {
        header('Location: index.php');
        exit;
    }
    $error = 'Invalid username or password.';
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0F4C5C">
<meta name="description" content="Strata Staff Global — Newsletter Management">
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<title>Login — Strata Staff Global</title>
<style>
  :root{
    --brand:#0F4C5C;
    --brand-dark:#0a3540;
    --accent:#1B9AAA;
    --success:#1B5E36;
    --success-bg:#E7F3EC;
    --danger:#B00020;
    --danger-bg:#FDECEC;
    --gray-100:#F4F6F7;
    --gray-200:#E2E6E9;
    --gray-300:#D0D5DA;
    --gray-400:#9CA3AF;
    --gray-500:#6B7280;
    --gray-700:#374151;
    --gray-900:#1F2933;
    --shadow-lg:0 10px 40px rgba(0,0,0,.15);
    --radius:12px;
    --transition:.2s ease;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  body{background:linear-gradient(135deg, var(--brand) 0%, #0a3540 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .login-wrap{width:100%;max-width:400px}
  .login-card{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow-lg);padding:40px 36px;position:relative;overflow:hidden}
  .login-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--brand))}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}
  .brand-icon{width:40px;height:40px;background:var(--brand);border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(15,76,92,.25)}
  .brand-icon svg{width:22px;height:22px;fill:#fff}
  .brand-text h1{color:var(--gray-900);font-size:22px;margin:0;font-weight:800;letter-spacing:-.3px}
  .brand-text p{color:var(--gray-500);font-size:14px;margin:4px 0 0}
  .form-group{margin-bottom:18px}
  label{display:block;font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:6px}
  input{width:100%;padding:12px 14px;border:1px solid var(--gray-300);border-radius:8px;font-size:15px;font-family:inherit;color:var(--gray-900);background:#fff;transition:border-color var(--transition),box-shadow var(--transition)}
  input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(27,154,170,.12)}
  input::placeholder{color:var(--gray-400)}
  button{width:100%;background:var(--brand);color:#fff;border:0;padding:13px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:8px;transition:background var(--transition),transform var(--transition),box-shadow var(--transition);box-shadow:0 4px 14px rgba(15,76,92,.25)}
  button:hover{background:var(--brand-dark);transform:translateY(-1px);box-shadow:0 6px 20px rgba(15,76,92,.3)}
  button:active{transform:translateY(0)}
  .err{background:var(--danger-bg);border:1px solid #F5C2C2;color:var(--danger);padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:18px;display:flex;align-items:center;gap:8px}
  .err svg{flex-shrink:0;width:18px;height:18px}
  .footer-text{text-align:center;color:rgba(255,255,255,.5);font-size:12px;margin-top:24px}
  @media(max-width:480px){
    .login-card{padding:32px 24px}
    .brand-text h1{font-size:20px}
  }
</style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
        </div>
        <div class="brand-text">
          <h1>Strata Staff Global</h1>
          <p>Newsletter Management</p>
        </div>
      </div>
      <?php if ($error): ?>
      <div class="err">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <?= h($error) ?>
      </div>
      <?php endif; ?>
      <form method="post">
        <div class="form-group">
          <label for="user">Username</label>
          <input id="user" name="user" autofocus placeholder="Enter username" value="<?= h($_POST['user'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label for="pass">Password</label>
          <input id="pass" name="pass" type="password" placeholder="Enter password">
        </div>
        <button type="submit">Log in</button>
      </form>
    </div>
    <p class="footer-text">Strata Staff Global &mdash; Secure Admin Portal</p>
  </div>
</body>
</html>
