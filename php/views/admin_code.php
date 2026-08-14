<?php /** @var array $errors */ ?>
<h2>Enter Verification Code</h2>
<p class="muted">A one-time 8-character code was sent to your email. It expires in 10 minutes.</p>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<form method="post" action="/login/code">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>8-character code</label>
  <input type="text" name="code" pattern="[A-Za-z0-9]{8}" maxlength="8" required>
  <button type="submit">Verify</button>
</form>
<form method="post" action="/login/resend">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <button type="submit" class="muted">Resend code</button>
</form>
