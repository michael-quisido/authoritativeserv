<?php /** @var array $rule */ /** @var array $errors */ /** @var bool $sent */ ?>
<h2>Restricted Area</h2>
<p class="muted">This URL is protected by the KMCQ GmbH URL Checkpoint. Request an 8-character verification code (sent to the registered email) and enter it to continue.</p>
<?php if (!empty($errors)): ?>
  <div class="flash err"><?= e($errors[0]) ?></div>
<?php endif; ?>
<?php if ($sent): ?>
  <div class="flash ok">A verification code was sent to your email.</div>
<?php endif; ?>
<form method="post" action="<?= e($rule['dummy_path']) ?>">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <input type="hidden" name="action" value="send">
  <button type="submit">Send verification code</button>
</form>
<form method="post" action="<?= e($rule['dummy_path']) ?>">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <input type="hidden" name="action" value="verify">
  <label>8-character code</label>
  <input type="text" name="code" pattern="[A-Za-z0-9]{8}" maxlength="8" required>
  <button type="submit">Verify and continue</button>
</form>
