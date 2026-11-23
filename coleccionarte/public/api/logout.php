<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => cookie_path(), 'httponly' => true, 'samesite' => 'Lax']);
json_out(['ok' => true]);
