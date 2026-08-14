<?php /** @var array $users */ /** @var array $rules */ ?>
<div class="right"><a class="btn" href="/logout">Logout</a></div>
<h2>Settings Dashboard</h2>
<p class="muted">Logged in as <?= e($_SESSION['admin_username'] ?? 'admin') ?></p>

<hr>
<h3>Users</h3>
<table>
  <tr><th>ID</th><th>Username</th><th>Email</th><th></th></tr>
  <?php foreach ($users as $u): ?>
  <tr>
    <td><?= e((string) $u['id']) ?></td>
    <td><?= e($u['username']) ?></td>
    <td><?= e($u['email']) ?></td>
    <td>
      <form method="post" action="/settings/users/delete" onsubmit="return confirm('Delete this user?');">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <input type="hidden" name="user_id" value="<?= e((string) $u['id']) ?>">
        <button type="submit" class="muted">Delete</button>
      </form>
    </td>
  </tr>
  <?php endforeach; ?>
</table>
<form method="post" action="/settings/users/add">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>New user username</label>
  <input type="text" name="username" required>
  <label>New user password</label>
  <input type="text" name="password" required>
  <label>New user email</label>
  <input type="email" name="email" required>
  <button type="submit">Add user</button>
</form>

<hr>
<h3>Protected URL Rules</h3>
<table>
  <tr><th>ID</th><th>Dummy path</th><th>Real path</th><th>Assigned user</th><th></th></tr>
  <?php foreach ($rules as $r): ?>
  <tr>
    <td><?= e((string) $r['id']) ?></td>
    <td><code><?= e($r['dummy_path']) ?></code></td>
    <td><code><?= e($r['real_path']) ?></code></td>
    <td><?= e($r['username']) ?></td>
    <td>
      <form method="post" action="/settings/rules/delete" onsubmit="return confirm('Delete this rule?');">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <input type="hidden" name="rule_id" value="<?= e((string) $r['id']) ?>">
        <button type="submit" class="muted">Delete</button>
      </form>
    </td>
  </tr>
  <?php endforeach; ?>
</table>
<form method="post" action="/settings/rules/add">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Dummy path (e.g. /name-folder)</label>
  <input type="text" name="dummy_path" required placeholder="/name-folder">
  <label>Real path (e.g. /administrators)</label>
  <input type="text" name="real_path" required placeholder="/administrators">
  <label>Assign to user</label>
  <select name="user_id" required>
    <?php foreach ($users as $u): ?>
      <option value="<?= e((string) $u['id']) ?>"><?= e($u['username']) ?> (<?= e($u['email']) ?>)</option>
    <?php endforeach; ?>
  </select>
  <button type="submit">Add rule</button>
</form>

<hr>
<h3>Change Admin Password</h3>
<form method="post" action="/settings/password">
  <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
  <label>Current password</label>
  <input type="password" name="current_password" required>
  <label>New password</label>
  <input type="password" name="new_password" required>
  <button type="submit">Change password</button>
</form>
