<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (!current_session()) json_out(['error' => 'no_autenticado'], 401);
json_out(current_drop());
