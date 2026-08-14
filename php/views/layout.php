<?php /** @var string $page_title */ /** @var string $content */ ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($page_title) ?></title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #fafafa; margin: 0; padding: 24px; color: #1a1a1a; }
  .card { max-width: 420px; margin: 48px auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 24px; }
  .card.wide { max-width: 720px; }
  label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; }
  input[type=text], input[type=password], input[type=email], select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
  button, .btn { display: inline-block; margin-top: 16px; padding: 10px 16px; border: none; border-radius: 6px; background: #e07b00; color: #fff; font-size: 14px; cursor: pointer; text-decoration: none; }
  .flash { padding: 10px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
  .flash.ok { background: #e6f4e6; color: #1a5a1a; border: 1px solid #a6d8a6; }
  .flash.err { background: #fbeaea; color: #8a1a1a; border: 1px solid #eebcbc; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
  th { font-size: 12px; text-transform: uppercase; color: #777; }
  .muted { color: #777; font-size: 13px; }
  .right { float: right; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  code { background: #f3f3f3; padding: 1px 6px; border-radius: 4px; }
</style>
</head>
<body>
<div class="card<?= $wide ? ' wide' : '' ?>">
<?php $f = flash_get(); if ($f): ?>
  <div class="flash <?= e($f['type']) ?>"><?= e($f['message']) ?></div>
<?php endif; ?>
<?= $content ?>
</div>
</body>
</html>
