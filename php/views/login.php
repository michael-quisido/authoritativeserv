<?php /** @var array $errors */ ?>
<h2>Admin Login</h2>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<form method="post" action="/login">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Username</label>
  <input type="text" name="username" required autofocus>
  <label>Password</label>
  <input type="password" name="password" required>
  <button type="submit">Login</button>
</form>
