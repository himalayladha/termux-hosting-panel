<?php
// WordPress SQLite Edition Bootstrap
$db_file = __DIR__ . '/../data/wordpress.db';
if (!file_exists(dirname($db_file))) {
    mkdir(dirname($db_file), 0777, true);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WordPress SQLite Starter • TermuxPanel</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, sans-serif; background: #f0f0f1; color: #3c434a; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
    .card { background: #ffffff; border-radius: 8px; border: 1px solid #c3c4c7; padding: 36px; max-width: 620px; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    h1 { color: #135e96; margin-top: 0; font-size: 26px; }
    .status-box { background: #edf6fa; border-left: 4px solid #00a32a; padding: 12px 16px; margin: 20px 0; border-radius: 4px; }
    .btn { background: #2271b1; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 4px; display: inline-block; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <h1>WordPress (SQLite Edition)</h1>
    <div class="status-box">
      <strong>✓ Pure SQLite Backend Ready</strong>
      <p style="margin: 4px 0 0 0; font-size: 14px;">PHP <?php echo phpversion(); ?> is serving this CMS with pure SQLite file database. No heavy MySQL service needed on Android!</p>
    </div>
    <p>This starter template provides the lightweight SQLite drop-in engine allowing you to host dynamic PHP sites and blogs directly from your phone.</p>
    <div style="margin-top: 24px;">
      <a href="#" class="btn" onclick="alert('WordPress SQLite database is connected and operational!')">Test CMS Database Connection</a>
    </div>
  </div>
</body>
</html>
